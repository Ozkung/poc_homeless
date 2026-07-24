import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly swaggerDocsUrl: string;

  constructor(private config: ConfigService) {
    this.from = this.config.get<string>('mail.from') ?? '';
    this.swaggerDocsUrl = this.config.get<string>('swaggerDocsUrl') ?? '';
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host'),
      port: this.config.get<number>('mail.port'),
      auth: {
        user: this.config.get<string>('mail.user'),
        pass: this.config.get<string>('mail.pass'),
      },
    });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }

  async sendApiAccessApproval(to: string, params: { token: string; manualUrl?: string }): Promise<void> {
    const manualSection = params.manualUrl
      ? `<p>คู่มือการใช้งาน: <a href="${params.manualUrl}">${params.manualUrl}</a></p>`
      : '';
    const html = `
      <p>คำขอใช้งาน Open API ของท่านได้รับการอนุมัติแล้ว</p>
      <p>Token สำหรับเข้าถึง API: <code>${params.token}</code></p>
      <p>เอกสาร Swagger: <a href="${this.swaggerDocsUrl}">${this.swaggerDocsUrl}</a></p>
      ${manualSection}
      <p>กรุณาเก็บ Token นี้ไว้อย่างปลอดภัย ระบบจะไม่แสดง Token นี้ซ้ำอีก</p>
    `;
    await this.send(to, 'คำขอใช้งาน Open API ได้รับการอนุมัติ', html);
  }

  async sendApiAccessRejection(to: string, params: { reason?: string }): Promise<void> {
    const reasonSection = params.reason ? `<p>เหตุผล: ${params.reason}</p>` : '';
    const html = `
      <p>คำขอใช้งาน Open API ของท่านไม่ได้รับการอนุมัติ</p>
      ${reasonSection}
    `;
    await this.send(to, 'คำขอใช้งาน Open API ไม่ได้รับการอนุมัติ', html);
  }
}
