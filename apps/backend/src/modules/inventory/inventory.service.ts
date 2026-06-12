import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { StockInDto } from './dto/stock-in.dto';
import { AdjRequestDto } from './dto/adj-request.dto';
import { ReviewAdjDto } from './dto/review-adj.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createItem(orgId: string, dto: CreateItemDto) {
    return this.prisma.inventoryItem.create({
      data: { ...dto, organizationId: orgId, lowStockThreshold: dto.lowStockThreshold ?? 10 },
    });
  }

  async listItems(orgId: string, category?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true, ...(category ? { category: category as any } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async getLowStockItems(orgId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
    });
    return items.filter((i) => i.currentStock <= i.lowStockThreshold);
  }

  async getExpiringLots(orgId: string) {
    const cutoff = new Date(Date.now() + 30 * 86_400_000);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        item: { organizationId: orgId },
        isExpired: false,
        remaining: { gt: 0 },
        expiryDate: { lte: cutoff },
      },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    return lots.map((lot) => ({
      lotId: lot.id,
      itemId: lot.itemId,
      itemName: lot.item.name,
      unit: lot.item.unit,
      remaining: lot.remaining,
      expiryDate: lot.expiryDate,
      daysLeft: Math.ceil((lot.expiryDate.getTime() - Date.now()) / 86_400_000),
      unitCost: lot.unitCost,
    }));
  }

  async expireLot(lotId: string, actorId: string, orgId: string) {
    const lot = await this.prisma.inventoryLot.findFirst({
      where: { id: lotId, item: { organizationId: orgId } },
      include: { item: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    if (lot.isExpired) throw new BadRequestException('Lot นี้ถูกนำออกไปแล้ว');

    const newStock = lot.item.currentStock - lot.remaining;

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryLot.update({
        where: { id: lotId },
        data: { isExpired: true, expiredAt: new Date(), expiredById: actorId, remaining: 0 },
      });
      await tx.stockTransaction.create({
        data: {
          itemId: lot.itemId,
          actorId,
          type: 'OUT_EXPIRED',
          quantity: -lot.remaining,
          balanceAfter: newStock,
          lotId,
          reason: 'ยาหมดอายุ',
        },
      });
      await tx.inventoryItem.update({
        where: { id: lot.itemId },
        data: { currentStock: newStock },
      });
    });
  }

  async getLots(itemId: string, orgId: string) {
    await this.findItemOrThrow(itemId, orgId);
    return this.prisma.inventoryLot.findMany({
      where: { itemId },
      include: {
        actor: { select: { displayName: true } },
        expiredBy: { select: { displayName: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getTransactionHistory(itemId: string, orgId: string) {
    await this.findItemOrThrow(itemId, orgId);
    return this.prisma.stockTransaction.findMany({
      where: { itemId },
      include: {
        actor: { select: { displayName: true } },
        lot: { select: { expiryDate: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async stockIn(itemId: string, orgId: string, actorId: string, dto: StockInDto) {
    const item = await this.findItemOrThrow(itemId, orgId);

    if (new Date(dto.expiryDate) <= new Date()) {
      throw new BadRequestException('วันหมดอายุต้องเป็นวันในอนาคต');
    }

    const newStock = item.currentStock + dto.quantity;

    await this.prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({
        data: {
          itemId,
          actorId,
          quantity: dto.quantity,
          remaining: dto.quantity,
          expiryDate: new Date(dto.expiryDate),
          receiptNo: dto.receiptNo,
          donorName: dto.donorName,
          unitCost: dto.unitCost,
        },
      });

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: newStock },
      });

      await tx.stockTransaction.create({
        data: {
          itemId,
          actorId,
          type: dto.type,
          quantity: dto.quantity,
          balanceAfter: newStock,
          donorName: dto.donorName,
          receiptNo: dto.receiptNo,
          unitCost: dto.unitCost,
          lotId: lot.id,
        },
      });
    });
  }

  async deduct(
    itemId: string,
    qty: number,
    ctx: { actorId: string; type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY'; patientId?: string; eventId?: string; orgId: string },
  ) {
    const item = await this.findItemOrThrow(itemId, ctx.orgId);
    if (item.currentStock - qty < 0) {
      throw new BadRequestException(`สต็อกไม่พอ (มี ${item.currentStock} หน่วย)`);
    }

    const lots = await this.prisma.inventoryLot.findMany({
      where: { itemId, isExpired: false, remaining: { gt: 0 } },
      orderBy: { expiryDate: 'asc' },
    });

    const newStock = item.currentStock - qty;

    await this.prisma.$transaction(async (tx) => {
      let toDeduct = qty;
      let runningBalance = item.currentStock;

      for (const lot of lots) {
        if (toDeduct === 0) break;
        const take = Math.min(lot.remaining, toDeduct);
        runningBalance -= take;

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { remaining: lot.remaining - take },
        });
        await tx.stockTransaction.create({
          data: {
            itemId,
            actorId: ctx.actorId,
            type: ctx.type,
            quantity: -take,
            balanceAfter: runningBalance,
            patientId: ctx.patientId,
            eventId: ctx.eventId,
            lotId: lot.id,
          },
        });
        toDeduct -= take;
      }

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: newStock },
      });
    });

    if (ctx.type === 'OUT_PRESCRIPTION' && ctx.patientId) {
      await this.prisma.activity.create({
        data: {
          actorId: ctx.actorId,
          patientId: ctx.patientId,
          type: 'DISPENSE',
          payload: { itemId, itemName: item.name, quantity: qty },
        },
      });
    }

    if (newStock <= item.lowStockThreshold) {
      const admins = await this.prisma.user.findMany({
        where: { organizationId: ctx.orgId, role: UserRole.ADMIN, lineUserId: { not: null } },
        select: { lineUserId: true },
      });
      for (const a of admins) {
        if (a.lineUserId) {
          await this.notifications.enqueueLowStock({
            lineUserId: a.lineUserId, itemName: item.name,
            currentStock: newStock, threshold: item.lowStockThreshold,
          });
        }
      }
    }
  }

  async requestAdj(itemId: string, orgId: string, actorId: string, dto: AdjRequestDto) {
    const item = await this.findItemOrThrow(itemId, orgId);
    const requester = await this.prisma.user.findUnique({
      where: { id: actorId }, select: { displayName: true },
    });

    const superAdmins = await this.prisma.user.findMany({
      where: { organizationId: orgId, role: UserRole.SUPER_ADMIN, lineUserId: { not: null } },
      select: { lineUserId: true },
    });

    if (Math.abs(dto.quantity) <= 20) {
      const newStock = item.currentStock + dto.quantity;
      await this.prisma.$transaction([
        this.prisma.inventoryItem.update({ where: { id: itemId }, data: { currentStock: newStock } }),
        this.prisma.stockTransaction.create({
          data: {
            itemId, actorId, type: 'ADJ_APPROVED',
            quantity: dto.quantity, balanceAfter: newStock, reason: dto.reason,
          },
        }),
      ]);

      for (const sa of superAdmins) {
        if (sa.lineUserId) {
          await this.notifications.enqueueAdjNotify({
            lineUserId: sa.lineUserId, itemName: item.name,
            qty: dto.quantity, adminName: requester?.displayName ?? 'Admin',
          });
        }
      }
      return { autoApproved: true };
    }

    const adj = await this.prisma.adjRequest.create({
      data: { itemId, requestedById: actorId, quantity: dto.quantity, reason: dto.reason },
    });

    for (const sa of superAdmins) {
      if (sa.lineUserId) {
        await this.notifications.enqueueAdjRequest({
          lineUserId: sa.lineUserId, itemName: item.name,
          qty: dto.quantity, adminName: requester?.displayName ?? 'Admin',
          reason: dto.reason, adjId: adj.id,
        });
      }
    }
    return { autoApproved: false, adjId: adj.id };
  }

  async getPendingAdj(orgId: string) {
    return this.prisma.adjRequest.findMany({
      where: { item: { organizationId: orgId }, status: 'PENDING' },
      include: {
        item: { select: { name: true, unit: true } },
        requester: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewAdj(adjId: string, reviewerId: string, orgId: string, dto: ReviewAdjDto) {
    const adj = await this.prisma.adjRequest.findFirst({
      where: { id: adjId, item: { organizationId: orgId }, status: 'PENDING' },
      include: { item: true, requester: { select: { lineUserId: true } } },
    });
    if (!adj) throw new NotFoundException('AdjRequest not found');

    await this.prisma.adjRequest.update({
      where: { id: adjId },
      data: { status: dto.status, reviewedById: reviewerId, reviewNote: dto.reviewNote },
    });

    if (dto.status === 'APPROVED') {
      const newStock = adj.item.currentStock + adj.quantity;
      await this.prisma.$transaction([
        this.prisma.inventoryItem.update({ where: { id: adj.itemId }, data: { currentStock: newStock } }),
        this.prisma.stockTransaction.create({
          data: {
            itemId: adj.itemId, actorId: reviewerId, type: 'ADJ_APPROVED',
            quantity: adj.quantity, balanceAfter: newStock, reason: adj.reason,
          },
        }),
      ]);
    }

    if (adj.requester.lineUserId) {
      await this.notifications.enqueueAdjResult({
        lineUserId: adj.requester.lineUserId, itemName: adj.item.name,
        qty: adj.quantity, approved: dto.status === 'APPROVED', reviewNote: dto.reviewNote,
      });
    }
  }

  private async findItemOrThrow(itemId: string, orgId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId: orgId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }
}
