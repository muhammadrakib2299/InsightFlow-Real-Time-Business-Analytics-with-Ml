import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WidgetType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateWidgetDto, UpdateWidgetDto } from './dto/widget.dto';

@Injectable()
export class WidgetsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertDashboardInWorkspace(workspaceId: string, dashboardId: string) {
    const dash = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, workspaceId },
      select: { id: true },
    });
    if (!dash) throw new NotFoundException('dashboard not found');
  }

  async create(workspaceId: string, dashboardId: string, dto: CreateWidgetDto) {
    await this.assertDashboardInWorkspace(workspaceId, dashboardId);
    return this.prisma.widget.create({
      data: {
        dashboardId,
        type: dto.type as WidgetType,
        title: dto.title,
        configJson: (dto.config ?? {}) as Prisma.InputJsonValue,
        positionX: dto.positionX ?? 0,
        positionY: dto.positionY ?? 0,
        width: dto.width ?? 4,
        height: dto.height ?? 3,
      },
    });
  }

  async update(
    workspaceId: string,
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetDto,
  ) {
    await this.assertDashboardInWorkspace(workspaceId, dashboardId);
    const existing = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId },
    });
    if (!existing) throw new NotFoundException('widget not found');

    const data: Prisma.WidgetUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.config !== undefined) data.configJson = dto.config as Prisma.InputJsonValue;
    if (dto.positionX !== undefined) data.positionX = dto.positionX;
    if (dto.positionY !== undefined) data.positionY = dto.positionY;
    if (dto.width !== undefined) data.width = dto.width;
    if (dto.height !== undefined) data.height = dto.height;
    return this.prisma.widget.update({ where: { id: widgetId }, data });
  }

  async delete(workspaceId: string, dashboardId: string, widgetId: string) {
    await this.assertDashboardInWorkspace(workspaceId, dashboardId);
    const existing = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId },
    });
    if (!existing) throw new NotFoundException('widget not found');
    await this.prisma.widget.delete({ where: { id: widgetId } });
    return { id: widgetId, deleted: true };
  }
}
