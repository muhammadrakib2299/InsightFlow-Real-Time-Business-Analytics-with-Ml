import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getForUser(workspaceId: string, userId: string) {
    const ws = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
    if (!ws) throw new NotFoundException('workspace not found');
    return ws;
  }

  async resolveRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return member?.role ?? null;
  }

  async requireRole(
    workspaceId: string,
    userId: string,
    allowed: WorkspaceRole[],
  ): Promise<WorkspaceRole> {
    const role = await this.resolveRole(workspaceId, userId);
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('insufficient role for this workspace');
    }
    return role;
  }

  async invite(
    workspaceId: string,
    inviterId: string,
    inviteeUserId: string,
    role: WorkspaceRole,
  ) {
    await this.requireRole(workspaceId, inviterId, ['owner']);
    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: inviteeUserId } },
      create: { workspaceId, userId: inviteeUserId, role },
      update: { role },
    });
  }
}
