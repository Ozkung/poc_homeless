import { Test } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  patient: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  eventTask: { count: jest.fn(), findMany: jest.fn() },
  activity: { findMany: jest.fn() },
  inventoryItem: { count: jest.fn(), findMany: jest.fn() },
  adjRequest: { count: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = mod.get(DashboardService);
    jest.clearAllMocks();
  });

  it('getAdminStats returns patient counts', async () => {
    mockPrisma.patient.count.mockResolvedValue(50);
    mockPrisma.eventTask.count.mockResolvedValue(20);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.patient.findMany.mockResolvedValue([]);
    const result = await service.getAdminStats('org1', new Date('2026-01-01'), new Date('2026-06-09'));
    expect(result).toHaveProperty('patients');
    expect(result).toHaveProperty('taskSuccessRate');
    expect(result).toHaveProperty('zoneBreakdown');
  });

  it('getFWStats returns medicationAdherence', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([]);
    mockPrisma.eventTask.findMany.mockResolvedValue([]);
    mockPrisma.eventTask.count.mockResolvedValue(0);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    const result = await service.getFWStats('user1', 'org1', new Date('2026-01-01'), new Date('2026-06-09'));
    expect(result).toHaveProperty('medicationAdherence');
    expect(result).toHaveProperty('ageDistribution');
    expect(result).toHaveProperty('topConditions');
  });
});
