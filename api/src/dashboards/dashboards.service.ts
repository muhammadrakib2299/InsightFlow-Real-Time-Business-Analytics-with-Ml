import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.dashboard.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(workspaceId: string, dashboardId: string) {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    });
    if (!dash) throw new NotFoundException('dashboard not found');
    return dash;
  }

  async create(workspaceId: string, userId: string, dto: CreateDashboardDto) {
    return this.prisma.dashboard.create({
      data: {
        workspaceId,
        createdById: userId,
        name: dto.name,
        description: dto.description,
        layoutJson: [],
      },
    });
  }

  async update(workspaceId: string, dashboardId: string, dto: UpdateDashboardDto) {
    const existing = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
    });
    if (!existing) throw new NotFoundException('dashboard not found');
    const data: Prisma.DashboardUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.layout !== undefined) data.layoutJson = dto.layout as Prisma.InputJsonValue;
    return this.prisma.dashboard.update({ where: { id: dashboardId }, data });
  }

  async delete(workspaceId: string, dashboardId: string) {
    const existing = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
    });
    if (!existing) throw new NotFoundException('dashboard not found');
    await this.prisma.dashboard.delete({ where: { id: dashboardId } });
    return { id: dashboardId, deleted: true };
  }
}
