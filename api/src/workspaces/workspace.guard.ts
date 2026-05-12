import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/jwt.strategy';
import { WorkspacesService } from './workspaces.service';

/**
 * Resolves the `:workspaceId` route param and attaches the user's role
 * to req.workspace. Use AFTER JwtAuthGuard.
 *
 * Controllers that touch tenant data should declare:
 *   @UseGuards(JwtAuthGuard, WorkspaceGuard)
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    const workspaceId: string | undefined = req.params?.workspaceId ?? req.params?.id;

    if (!user) throw new ForbiddenException('no user');
    if (!workspaceId) throw new ForbiddenException('missing workspaceId param');

    const role = await this.workspaces.resolveRole(workspaceId, user.id);
    if (!role) throw new ForbiddenException('not a member of this workspace');

    req.workspace = { id: workspaceId, role };
    return true;
  }
}
