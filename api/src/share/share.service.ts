import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

interface SharePayload {
  v: 1; // version
  d: string; // dashboard id
  w: string; // workspace id
  exp: number | null; // epoch seconds, null = no expiry
  jti: string; // token id (matches share_links.token_hash via sha256)
}

const TOKEN_PREFIX = 'ifs1.';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  let pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad !== 0) throw new Error('bad b64url length');
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class ShareService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('SHARE_LINK_SECRET', 'change_me_share') as string;
  }

  /**
   * Mint a signed share token for a dashboard and persist its hash so we can
   * revoke later. Returns the raw token (shown once).
   */
  async create(
    workspaceId: string,
    dashboardId: string,
    createdById: string,
    ttlSeconds?: number,
  ): Promise<{ token: string; expiresAt: Date | null }> {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
      select: { id: true },
    });
    if (!dash) throw new NotFoundException('dashboard not found');

    const jti = b64url(randomBytes(18));
    const expSeconds = ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : null;
    const payload: SharePayload = {
      v: 1,
      d: dashboardId,
      w: workspaceId,
      exp: expSeconds,
      jti,
    };
    const payloadStr = b64url(Buffer.from(JSON.stringify(payload)));
    const sig = b64url(
      createHmac('sha256', this.secret).update(payloadStr).digest(),
    );
    const token = `${TOKEN_PREFIX}${payloadStr}.${sig}`;
    const tokenHash = sha256Hex(token);

    await this.prisma.shareLink.create({
      data: {
        workspaceId,
        dashboardId,
        createdById,
        tokenHash,
        expiresAt: expSeconds ? new Date(expSeconds * 1000) : null,
      },
    });

    return {
      token,
      expiresAt: expSeconds ? new Date(expSeconds * 1000) : null,
    };
  }

  async list(workspaceId: string) {
    return this.prisma.shareLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        dashboardId: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async revoke(workspaceId: string, id: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { id, workspaceId },
    });
    if (!link) throw new NotFoundException('share link not found');
    if (link.revokedAt) return link;
    return this.prisma.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Verify a token and return the (workspaceId, dashboardId) it points
   * at. Throws Unauthorized on every failure mode — never leaks why.
   */
  async verify(token: string): Promise<{ workspaceId: string; dashboardId: string }> {
    if (!token || !token.startsWith(TOKEN_PREFIX)) {
      throw new UnauthorizedException('invalid share token');
    }
    const rest = token.slice(TOKEN_PREFIX.length);
    const parts = rest.split('.');
    if (parts.length !== 2) throw new UnauthorizedException('invalid share token');
    const [payloadStr, sig] = parts;

    const expected = createHmac('sha256', this.secret).update(payloadStr).digest();
    let sigBuf: Buffer;
    try {
      sigBuf = b64urlDecode(sig);
    } catch {
      throw new UnauthorizedException('invalid share token');
    }
    if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) {
      throw new UnauthorizedException('invalid share token');
    }

    let payload: SharePayload;
    try {
      payload = JSON.parse(b64urlDecode(payloadStr).toString('utf-8')) as SharePayload;
    } catch {
      throw new UnauthorizedException('invalid share token');
    }
    if (payload.v !== 1) throw new UnauthorizedException('unsupported share token version');
    if (payload.exp !== null && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('share token expired');
    }

    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: sha256Hex(token), workspaceId: payload.w, dashboardId: payload.d },
    });
    if (!link) throw new UnauthorizedException('share token not on record');
    if (link.revokedAt) throw new UnauthorizedException('share token revoked');

    return { workspaceId: payload.w, dashboardId: payload.d };
  }

  /**
   * Read-only dashboard payload for an authenticated share request.
   * Throws NotFound rather than 401 if the dashboard has been deleted
   * — a valid token for a deleted dashboard is a 404, not an auth fail.
   */
  async readDashboard(workspaceId: string, dashboardId: string) {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    });
    if (!dash) throw new NotFoundException('dashboard not found');
    return dash;
  }
}
