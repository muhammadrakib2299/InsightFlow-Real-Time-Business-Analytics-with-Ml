import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma.service';

export interface IssuedKey {
  id: string;
  prefix: string;
  /** Returned ONCE at creation. Never persisted. */
  secret: string;
  name: string;
  scopes: string[];
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `ifk_live_` + 32 url-safe random bytes. The 12-char prefix
   * (`ifk_live_xy`) is stored in plaintext for lookup UX; the full key
   * is hashed with argon2id and stored in `hash`.
   */
  private generateKey(): { full: string; prefix: string } {
    const random = randomBytes(32).toString('base64url'); // 43 chars
    const full = `ifk_live_${random}`;
    const prefix = full.slice(0, 12);
    return { full, prefix };
  }

  async issue(
    workspaceId: string,
    createdById: string,
    name: string,
    scopes: string[] = ['events:write'],
  ): Promise<IssuedKey> {
    // Collisions on a 12-char prefix are negligible (~1 in 2^60 of url-safe
    // alphabet), but we still retry to be safe.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { full, prefix } = this.generateKey();
      const existing = await this.prisma.apiKey.findUnique({ where: { prefix } });
      if (existing) continue;
      const hash = await argon2.hash(full, { type: argon2.argon2id });
      const record = await this.prisma.apiKey.create({
        data: {
          workspaceId,
          createdById,
          name,
          prefix,
          hash,
          scopes,
        },
      });
      return {
        id: record.id,
        prefix,
        secret: full,
        name,
        scopes,
        createdAt: record.createdAt,
      };
    }
    throw new Error('failed to generate unique api key prefix');
  }

  async list(workspaceId: string) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });
  }

  async revoke(workspaceId: string, keyId: string) {
    const record = await this.prisma.apiKey.findFirst({
      where: { id: keyId, workspaceId },
    });
    if (!record) throw new NotFoundException('api key not found');
    if (record.revokedAt) return record;
    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }
}
