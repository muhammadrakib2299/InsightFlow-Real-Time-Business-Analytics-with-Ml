import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { TokenPair, TokenService } from './token.service';

const BCRYPT_COST = 12;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

export interface AuthResult {
  user: { id: string; email: string; displayName: string | null };
  workspace: { id: string; name: string; slug: string };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('email already in use');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const wsName = dto.workspaceName?.trim() || `${dto.displayName ?? dto.email.split('@')[0]}'s workspace`;
    const baseSlug = slugify(wsName);

    // Race-tolerant: try the base slug, fall back to suffixed slugs if taken.
    const slug = await this.uniqueSlug(baseSlug);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
        },
      });
      const workspace = await tx.workspace.create({
        data: { name: wsName, slug, ownerId: user.id },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
          joinedAt: new Date(),
        },
      });
      return { user, workspace };
    });

    const tokens = await this.tokens.issue(result.user.id, result.user.email);
    this.logger.log(`signup user=${result.user.id} workspace=${result.workspace.id}`);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const ownedOrMember = await this.prisma.workspace.findFirst({
      where: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!ownedOrMember) {
      // Defensive: every user is created with a workspace; if missing,
      // surface as an unauthorized rather than 500.
      throw new UnauthorizedException('no workspace');
    }

    const tokens = await this.tokens.issue(user.id, user.email);
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      workspace: {
        id: ownedOrMember.id,
        name: ownedOrMember.name,
        slug: ownedOrMember.slug,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload;
    try {
      payload = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('wrong token type');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('user gone');
    return this.tokens.issue(user.id, user.email);
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const taken = await this.prisma.workspace.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
