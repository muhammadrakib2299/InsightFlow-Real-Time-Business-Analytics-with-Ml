import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessPayload } from './token.service';

export interface AuthUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'change_me_access'),
    });
  }

  validate(payload: AccessPayload): AuthUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('wrong token type');
    }
    return { id: payload.sub, email: payload.email };
  }
}
