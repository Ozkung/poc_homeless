import { Test } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { Response } from 'express';

const mockAuthService = {
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  verifyLiffToken: jest.fn(),
};

function mockRes(): Partial<Response> {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('AuthController cookie behaviour', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();
    controller = module.get(AuthController);
    jest.clearAllMocks();
  });

  it('login sets HttpOnly cookie and returns only accessToken + role', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      role: 'CASE_MANAGER',
    });
    const res = mockRes() as Response;
    const result = await controller.login({ email: 'a@b.com', password: 'pw' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'rt',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
    expect(result).toEqual({ accessToken: 'at', role: 'CASE_MANAGER' });
    expect((result as any).refreshToken).toBeUndefined();
  });

  it('logout clears cookie', async () => {
    mockAuthService.logout.mockResolvedValue(undefined);
    const res = mockRes() as Response;
    await controller.logout(res, 'rt');
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
  });
});
