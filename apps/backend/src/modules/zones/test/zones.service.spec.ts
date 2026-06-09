import { Test } from '@nestjs/testing';
import { ZonesService } from '../zones.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  zone: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ZonesService', () => {
  let service: ZonesService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get(ZonesService);
    jest.clearAllMocks();
  });

  it('findAll returns zones for org', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1', name: 'สวนลุม', organizationId: 'org1' }]);
    const result = await service.findAll('org1');
    expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' }, include: { _count: { select: { patients: true } } } });
    expect(result).toHaveLength(1);
  });

  it('create makes a zone', async () => {
    mockPrisma.zone.create.mockResolvedValue({ id: 'z2', name: 'หัวลำโพง', organizationId: 'org1' });
    const result = await service.create('org1', { name: 'หัวลำโพง', description: null, color: '#7c3aed' });
    expect(result.name).toBe('หัวลำโพง');
  });
});
