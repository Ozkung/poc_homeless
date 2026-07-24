import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from '../mail.service';

jest.mock('nodemailer');

const mockSendMail = jest.fn();
const mockCreateTransport = nodemailer.createTransport as jest.Mock;

const configValues: Record<string, any> = {
  'mail.host': 'smtp.example.com',
  'mail.port': 587,
  'mail.user': 'user',
  'mail.pass': 'pass',
  'mail.from': 'noreply@example.com',
  swaggerDocsUrl: 'https://example.com/swagger',
};
const mockConfig = { get: jest.fn((key: string) => configValues[key]) };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(MailService);
  });

  describe('sendApiAccessApproval', () => {
    it('sends an email containing the plaintext token', async () => {
      await service.sendApiAccessApproval('requester@example.com', { token: 'secret-token-123' });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('requester@example.com');
      expect(call.html).toContain('secret-token-123');
    });

    it('includes the Swagger docs link from config', async () => {
      await service.sendApiAccessApproval('requester@example.com', { token: 'x' });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain('https://example.com/swagger');
    });

    it('includes the manual link when provided', async () => {
      await service.sendApiAccessApproval('requester@example.com', { token: 'x', manualUrl: '/uploads/api-access/manual.pdf' });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain('/uploads/api-access/manual.pdf');
    });

    it('omits the manual link section when not provided', async () => {
      await service.sendApiAccessApproval('requester@example.com', { token: 'x' });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).not.toContain('undefined');
    });
  });

  describe('sendApiAccessRejection', () => {
    it('sends a rejection email with the reason when provided', async () => {
      await service.sendApiAccessRejection('requester@example.com', { reason: 'ข้อมูลไม่ครบถ้วน' });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('requester@example.com');
      expect(call.html).toContain('ข้อมูลไม่ครบถ้วน');
    });

    it('sends a rejection email without a reason section when omitted', async () => {
      await service.sendApiAccessRejection('requester@example.com', {});

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).not.toContain('undefined');
    });
  });
});
