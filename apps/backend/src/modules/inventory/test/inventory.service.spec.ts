import { Test } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockPrisma: any = {
  inventoryItem: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  inventoryLot: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  stockTransaction: { create: jest.fn(), findMany: jest.fn() },
  adjRequest: {
    create: jest.fn(), findMany: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(),
  },
  user: { findMany: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn((fnOrOps: any) => {
    if (typeof fnOrOps === 'function') return fnOrOps(mockPrisma);
    return Promise.all(fnOrOps);
  }),
};

const mockNotifications = {
  enqueueAdjNotify: jest.fn().mockResolvedValue(undefined),
  enqueueAdjRequest: jest.fn().mockResolvedValue(undefined),
  enqueueAdjResult: jest.fn().mockResolvedValue(undefined),
  enqueueLowStock: jest.fn().mockResolvedValue(undefined),
};

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(InventoryService);
    jest.clearAllMocks();
  });

  describe('stockIn', () => {
    it('creates InventoryLot + StockTransaction and updates currentStock', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1' },
      );
      mockPrisma.inventoryLot.create.mockResolvedValue({ id: 'lot1' });
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 150 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });

      await service.stockIn('item1', 'org1', 'user1', {
        type: 'IN_PURCHASE', quantity: 50,
        expiryDate: '2027-01-01', receiptNo: 'RX-001', unitCost: 2.5,
      });

      expect(mockPrisma.inventoryLot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemId: 'item1', quantity: 50, remaining: 50,
            expiryDate: new Date('2027-01-01'),
          }),
        }),
      );
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'IN_PURCHASE', quantity: 50, balanceAfter: 150, lotId: 'lot1',
          }),
        }),
      );
      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 150 } }),
      );
    });

    it('throws BadRequestException when expiryDate is in the past', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1' },
      );

      await expect(service.stockIn('item1', 'org1', 'user1', {
        type: 'IN_PURCHASE', quantity: 50, expiryDate: '2020-01-01',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('deduct (FIFO)', () => {
    it('deducts from single lot when qty fits in one lot', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 80, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.inventoryLot.findMany.mockResolvedValue([
        { id: 'lot1', remaining: 80, expiryDate: new Date(Date.now() + 60 * 86_400_000) },
      ]);
      mockPrisma.inventoryLot.update.mockResolvedValue({});
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 70 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.deduct('item1', 10, {
        actorId: 'user1', type: 'OUT_PRESCRIPTION', patientId: 'p1', orgId: 'org1',
      });

      expect(mockPrisma.inventoryLot.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { remaining: 70 } }),
      );
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: -10, balanceAfter: 70, lotId: 'lot1' }),
        }),
      );
    });

    it('spans two lots when qty exceeds first lot remaining (FIFO)', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 130, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.inventoryLot.findMany.mockResolvedValue([
        { id: 'lot1', remaining: 30, expiryDate: new Date(Date.now() + 5 * 86_400_000) },
        { id: 'lot2', remaining: 100, expiryDate: new Date(Date.now() + 60 * 86_400_000) },
      ]);
      mockPrisma.inventoryLot.update.mockResolvedValue({});
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 80 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.deduct('item1', 50, {
        actorId: 'user1', type: 'OUT_PRESCRIPTION', orgId: 'org1',
      });

      // lot1 (30) fully consumed, lot2 partially consumed (20 taken)
      expect(mockPrisma.inventoryLot.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.inventoryLot.update).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ where: { id: 'lot1' }, data: { remaining: 0 } }),
      );
      expect(mockPrisma.inventoryLot.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ where: { id: 'lot2' }, data: { remaining: 80 } }),
      );
    });

    it('throws BadRequestException when stock insufficient', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 5, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );

      await expect(service.deduct('item1', 10, {
        actorId: 'user1', type: 'OUT_PRESCRIPTION', orgId: 'org1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestAdj', () => {
    it('auto-approves and creates StockTransaction when abs(qty) <= 20', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 50, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 45 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx3' });
      mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Admin' });
      mockPrisma.user.findMany.mockResolvedValue([{ displayName: 'SA', lineUserId: 'U_SA' }]);

      await service.requestAdj('item1', 'org1', 'user1', { quantity: -5, reason: 'lost' });

      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ADJ_APPROVED', quantity: -5 }),
        }),
      );
      expect(mockNotifications.enqueueAdjNotify).toHaveBeenCalled();
      expect(mockPrisma.adjRequest.create).not.toHaveBeenCalled();
    });

    it('creates AdjRequest when abs(qty) > 20', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.adjRequest.create.mockResolvedValue({ id: 'adj1' });
      mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Admin' });
      mockPrisma.user.findMany.mockResolvedValue([{ displayName: 'SA', lineUserId: 'U_SA' }]);

      await service.requestAdj('item1', 'org1', 'user1', { quantity: -30, reason: 'expired' });

      expect(mockPrisma.adjRequest.create).toHaveBeenCalled();
      expect(mockNotifications.enqueueAdjRequest).toHaveBeenCalled();
      expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('getExpiringLots', () => {
    it('returns lots expiring within 30 days with daysLeft computed', async () => {
      const soon = new Date(Date.now() + 15 * 86_400_000);
      mockPrisma.inventoryLot.findMany.mockResolvedValue([
        {
          id: 'lot1', itemId: 'item1', remaining: 50, expiryDate: soon,
          unitCost: 2.5, item: { name: 'Metformin 500mg', unit: 'เม็ด' },
        },
      ]);

      const result = await service.getExpiringLots('org1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        lotId: 'lot1', itemName: 'Metformin 500mg', remaining: 50,
      });
      expect(result[0].daysLeft).toBeGreaterThanOrEqual(14);
      expect(result[0].daysLeft).toBeLessThanOrEqual(16);
    });
  });

  describe('expireLot', () => {
    it('soft-deletes lot and creates OUT_EXPIRED transaction', async () => {
      mockPrisma.inventoryLot.findFirst.mockResolvedValue({
        id: 'lot1', itemId: 'item1', remaining: 50, isExpired: false,
        item: { currentStock: 100, organizationId: 'org1' },
      });
      mockPrisma.inventoryLot.update.mockResolvedValue({ id: 'lot1', isExpired: true });
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 50 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });

      await service.expireLot('lot1', 'user1', 'org1');

      expect(mockPrisma.inventoryLot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isExpired: true, expiredById: 'user1' }),
        }),
      );
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OUT_EXPIRED', quantity: -50, lotId: 'lot1', balanceAfter: 50,
          }),
        }),
      );
      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 50 } }),
      );
    });

    it('throws BadRequestException if lot already expired', async () => {
      mockPrisma.inventoryLot.findFirst.mockResolvedValue({
        id: 'lot1', isExpired: true, remaining: 0,
        item: { currentStock: 0, organizationId: 'org1' },
      });

      await expect(service.expireLot('lot1', 'user1', 'org1'))
        .rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if lot not found', async () => {
      mockPrisma.inventoryLot.findFirst.mockResolvedValue(null);

      await expect(service.expireLot('bad-lot', 'user1', 'org1'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
