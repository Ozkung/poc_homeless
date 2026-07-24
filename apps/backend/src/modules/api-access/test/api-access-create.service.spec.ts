import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ApiAccessService } from '../api-access.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';

const mockPrisma: any = {
  apiAccessRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  apiAccessToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
};
const mockMail = { sendApiAccessApproval: jest.fn(), sendApiAccessRejection: jest.fn() };

describe('ApiAccessService — create', () => {
  let service: ApiAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApiAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();
    service = module.get(ApiAccessService);
  });

  it('creates a PENDING request with a valid scope', async () => {
    mockPrisma.apiAccessRequest.create.mockResolvedValue({ id: 'req1', status: 'PENDING' });

    const dto = {
      requesterName: 'Somchai', email: 'somchai@example.com', phone: '0812345678',
      requestedLevel: 'VIEW' as const, requestedScope: JSON.stringify({ Patient: ['hn', 'age'] }),
    };
    const result = await service.create(dto, '/uploads/api-access/justifications/x.pdf');

    expect(result.status).toBe('PENDING');
    expect(mockPrisma.apiAccessRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterName: 'Somchai',
          email: 'somchai@example.com',
          requestedLevel: 'VIEW',
          requestedScope: { Patient: ['hn', 'age'] },
          justificationFileUrl: '/uploads/api-access/justifications/x.pdf',
        }),
      }),
    );
  });

  it('rejects a scope referencing an unknown entity', async () => {
    const dto = {
      requesterName: 'Somchai', email: 'somchai@example.com', phone: '0812345678',
      requestedLevel: 'VIEW' as const, requestedScope: JSON.stringify({ NotAModel: ['x'] }),
    };

    await expect(service.create(dto, '/uploads/x.pdf')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.apiAccessRequest.create).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON in requestedScope', async () => {
    const dto = {
      requesterName: 'Somchai', email: 'somchai@example.com', phone: '0812345678',
      requestedLevel: 'VIEW' as const, requestedScope: 'not-json',
    };

    await expect(service.create(dto, '/uploads/x.pdf')).rejects.toThrow(BadRequestException);
  });
});

describe('ApiAccessService — getCatalog', () => {
  let service: ApiAccessService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ApiAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();
    service = module.get(ApiAccessService);
  });

  it('returns the entity/column catalog', () => {
    const catalog = service.getCatalog();
    expect(catalog.Patient).toContain('hn');
    expect(catalog.CareGiver).toContain('displayName');
  });
});
