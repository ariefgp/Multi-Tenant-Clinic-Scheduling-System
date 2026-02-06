import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { users, tenants } from '../../database/schema/index.js';
import type { AuthTokensDto, UserDto } from './dto/auth-response.dto.js';

interface GoogleUserProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateGoogleUser(profile: GoogleUserProfile): Promise<UserDto> {
    let [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, profile.googleId));

    if (!user) {
      [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, profile.email));

      if (user) {
        [user] = await this.db
          .update(users)
          .set({
            googleId: profile.googleId,
            picture: profile.picture,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
      }
    }

    if (!user) {
      // TODO: Real multi-tenant signup flow should determine tenant from:
      // 1. Invite link (user clicks invite from tenant admin)
      // 2. Email domain matching (e.g., @company.com -> company tenant)
      // 3. Tenant selection during OAuth callback
      // For demo purposes, we assign new users to the default 'demo-clinic' tenant
      const DEFAULT_TENANT_SLUG = 'demo-clinic';

      const [defaultTenant] = await this.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, DEFAULT_TENANT_SLUG));

      if (!defaultTenant) {
        throw new UnauthorizedException(
          `Default tenant '${DEFAULT_TENANT_SLUG}' not found. Please contact administrator.`,
        );
      }

      [user] = await this.db
        .insert(users)
        .values({
          tenantId: defaultTenant.id,
          email: profile.email,
          googleId: profile.googleId,
          name: profile.name,
          picture: profile.picture,
          role: 'staff',
          lastLoginAt: new Date(),
        })
        .returning();
    } else {
      await this.db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    };
  }

  async generateTokens(user: UserDto): Promise<AuthTokensDto> {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        tenantId: number;
        email: string;
        role: string;
      }>(refreshToken);

      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub));

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens({
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: number): Promise<UserDto> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    };
  }
}
