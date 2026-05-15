import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';
import { isKnownMetric } from '../events/metrics';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.alert.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(workspaceId: string, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, workspaceId } });
    if (!alert) throw new NotFoundException('alert not found');
    return alert;
  }

  async create(workspaceId: string, dto: CreateAlertDto) {
    if (!isKnownMetric(dto.metric)) {
      throw new BadRequestException(`unknown metric: ${dto.metric}`);
    }
    return this.prisma.alert.create({
      data: {
        workspaceId,
        name: dto.name,
        metric: dto.metric,
        method: dto.method as AlertMethod,
        thresholdParams: dto.thresholdParams as Prisma.InputJsonValue,
        channelsJson: dto.channels as unknown as Prisma.InputJsonValue,
        cooldownSeconds: dto.cooldownSeconds ?? 3600,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateAlertDto) {
    await this.get(workspaceId, id);
    const data: Prisma.AlertUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.thresholdParams !== undefined) {
      data.thresholdParams = dto.thresholdParams as Prisma.InputJsonValue;
    }
    if (dto.channels !== undefined) {
      data.channelsJson = dto.channels as unknown as Prisma.InputJsonValue;
    }
    if (dto.cooldownSeconds !== undefined) data.cooldownSeconds = dto.cooldownSeconds;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.alert.update({ where: { id }, data });
  }

  async delete(workspaceId: string, id: string) {
    await this.get(workspaceId, id);
    await this.prisma.alert.delete({ where: { id } });
    return { id, deleted: true };
  }

  async history(workspaceId: string, limit = 50) {
    return this.prisma.alertEvent.findMany({
      where: { workspaceId },
      orderBy: { firedAt: 'desc' },
      take: limit,
      include: { alert: { select: { name: true, metric: true } } },
    });
  }

  async recordFire(
    workspaceId: string,
    alertId: string,
    value: number,
    expected: number | null,
    payload: Record<string, unknown>,
  ) {
    return this.prisma.alertEvent.create({
      data: {
        workspaceId,
        alertId,
        value,
        expected: expected ?? undefined,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
