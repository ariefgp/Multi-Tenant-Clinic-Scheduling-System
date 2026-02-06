import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { GoogleAuthGuard } from './guards/google-auth.guard.js';
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
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  async googleAuthCallback(
    @Req() req: { user: UserDto },
    @Res() res: { redirect: (code: number, url: string) => void },
  ) {
    const user = req.user;
    const tokens = await this.authService.generateTokens(user);
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    const callbackUrl = new URL('/auth/callback', frontendUrl);
    callbackUrl.searchParams.set('accessToken', tokens.accessToken);
    callbackUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(302, callbackUrl.toString());
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
