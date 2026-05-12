import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AccessPayload {
  sub: string; // user id
  email: string;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.get<string>('JWT_ACCESS_SECRET', 'change_me_access');
    this.refreshSecret = config.get<string>('JWT_REFRESH_SECRET', 'change_me_refresh');
    this.accessTtl = Number(config.get<string>('JWT_ACCESS_TTL', '900'));
    this.refreshTtl = Number(config.get<string>('JWT_REFRESH_TTL', '604800'));
  }

  async issue(userId: string, email: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'access' } satisfies AccessPayload,
      { secret: this.accessSecret, expiresIn: this.accessTtl },
    );
    const jti = `${userId}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti, type: 'refresh' } satisfies RefreshPayload,
      { secret: this.refreshSecret, expiresIn: this.refreshTtl },
    );
    return {
      accessToken,
      refreshToken,
      accessExpiresIn: this.accessTtl,
      refreshExpiresIn: this.refreshTtl,
    };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    return this.jwt.verifyAsync<AccessPayload>(token, { secret: this.accessSecret });
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    return this.jwt.verifyAsync<RefreshPayload>(token, { secret: this.refreshSecret });
  }
}
