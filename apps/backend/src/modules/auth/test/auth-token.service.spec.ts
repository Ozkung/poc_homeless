import { Test } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { SseService } from '../../notifications/sse.service';

const mockConfig = { get: jest.fn() };

describe('AuthService — getRefreshCookieMaxAgeMs', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisConnectionToken('default'), useValue: {} },
        { provide: SseService, useValue: { emit: jest.fn(), getSubject: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('converts a "30d" config value into milliseconds', () => {
    mockConfig.get.mockReturnValue('30d');
    expect(service.getRefreshCookieMaxAgeMs()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('converts a "1h" config value into milliseconds', () => {
    mockConfig.get.mockReturnValue('1h');
    expect(service.getRefreshCookieMaxAgeMs()).toBe(60 * 60 * 1000);
  });

  it('falls back to 7 days when config is unset', () => {
    mockConfig.get.mockReturnValue(undefined);
    expect(service.getRefreshCookieMaxAgeMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
