import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { PrismaService } from '../common/prisma.service';
import { WorkspacesService } from './workspaces.service';

class InviteDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsIn(['member', 'viewer'])
  role!: 'member' | 'viewer';
}

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.workspaces.getForUser(id, user.id);
  }

  @Post(':id/invite')
  async invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const invitee = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!invitee) {
      // M2 scope: only invite existing users. Email-based invite link lands later.
      return { status: 'user-not-found', email: dto.email };
    }
    const member = await this.workspaces.invite(id, user.id, invitee.id, dto.role);
    return { status: 'ok', member };
  }
}
