import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Res,
  Req,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { UserPayload } from './decorators/current-user.decorator.js';
import type { UserDto, AuthTokensDto } from './dto/auth-response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @Public()
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth(@Res() res: FastifyReply) {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const callbackUrl =
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL');

    const googleAuthUrl = new URL(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', callbackUrl);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'email profile');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');

    return res.code(302).redirect(googleAuthUrl.toString());
  }

  @Get('google/callback')
  @Public()
  @ApiExcludeEndpoint()
  async googleAuthCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: FastifyReply,
  ) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    if (error) {
      const errorUrl = new URL('/auth/callback', frontendUrl);
      errorUrl.searchParams.set('error', error);
      return res.code(302).redirect(errorUrl.toString());
    }

    if (!code) {
      const errorUrl = new URL('/auth/callback', frontendUrl);
      errorUrl.searchParams.set('error', 'No authorization code received');
      return res.code(302).redirect(errorUrl.toString());
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);

      // Get user info from Google
      const userInfo = await this.getGoogleUserInfo(tokenResponse.access_token);

      // Validate and create/update user in our database
      const user = await this.authService.validateGoogleUser({
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture ?? null,
      });

      // Generate our JWT tokens
      const tokens = await this.authService.generateTokens(user);

      // Redirect to frontend with auth data
      const callbackUrl = new URL('/auth/callback', frontendUrl);
      const authData = encodeURIComponent(
        JSON.stringify({
          user,
          tokens,
        }),
      );
      callbackUrl.searchParams.set('data', authData);

      return res.code(302).redirect(callbackUrl.toString());
    } catch (err) {
      console.error('Google OAuth error:', err);
      const errorUrl = new URL('/auth/callback', frontendUrl);
      errorUrl.searchParams.set('error', 'Authentication failed');
      return res.code(302).redirect(errorUrl.toString());
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token?: string;
  }> {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret =
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    const callbackUrl =
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', errorText);
      throw new HttpException(
        'Failed to exchange authorization code',
        HttpStatus.BAD_REQUEST,
      );
    }

    return response.json();
  }

  private async getGoogleUserInfo(accessToken: string): Promise<{
    id: string;
    email: string;
    name: string;
    picture?: string;
  }> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new HttpException(
        'Failed to get user info from Google',
        HttpStatus.BAD_REQUEST,
      );
    }

    return response.json();
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() body: { refreshToken: string },
  ): Promise<AuthTokensDto> {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser() user: UserPayload): Promise<UserDto> {
    return this.authService.getMe(user.userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout (client should discard tokens)' })
  logout(): { message: string } {
    return { message: 'Logged out successfully' };
  }
}
