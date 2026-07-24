import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { API_ACCESS_CATALOG, isValidScope } from './column-catalog';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';
import { ApproveApiAccessRequestDto } from './dto/approve-api-access-request.dto';
import { RejectApiAccessRequestDto } from './dto/reject-api-access-request.dto';

@Injectable()
export class ApiAccessService {
  constructor(private prisma: PrismaService, private mail: MailService, private audit: AuditLogService) {}

  getCatalog(): Record<string, string[]> {
    return API_ACCESS_CATALOG;
  }

  private parseAndValidateScope(raw: string): Record<string, string[]> {
    let scope: Record<string, string[]>;
    try {
      scope = JSON.parse(raw);
    } catch {
      throw new BadRequestException('รูปแบบข้อมูลที่ขอเข้าถึงไม่ถูกต้อง');
    }
    if (!isValidScope(scope)) {
      throw new BadRequestException('ข้อมูลหรือคอลัมน์ที่ขอเข้าถึงไม่ถูกต้อง');
    }
    return scope;
  }

  async create(dto: CreateApiAccessRequestDto, justificationFileUrl: string) {
    const requestedScope = this.parseAndValidateScope(dto.requestedScope);

    return this.prisma.apiAccessRequest.create({
      data: {
        requesterName: dto.requesterName,
        requesterOrg: dto.requesterOrg,
        email: dto.email,
        phone: dto.phone,
        justificationFileUrl,
        requestedLevel: dto.requestedLevel,
        requestedScope,
      },
    });
  }

  async findAll(status?: string) {
    return this.prisma.apiAccessRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.apiAccessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('ไม่พบคำขอนี้');
    return request;
  }

  async approve(id: string, reviewerId: string, dto: ApproveApiAccessRequestDto) {
    const request = await this.prisma.apiAccessRequest.findUnique({ where: { id } });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('ไม่พบคำขอนี้ หรือถูกพิจารณาไปแล้ว');
    }

    const grantedLevel = dto.grantedLevel ?? request.requestedLevel;
    const grantedScope = dto.grantedScope ?? (request.requestedScope as Record<string, string[]>);
    if (!isValidScope(grantedScope)) {
      throw new BadRequestException('ข้อมูลหรือคอลัมน์ที่อนุญาตไม่ถูกต้อง');
    }

    const plaintextToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(plaintextToken).digest('hex');

    await this.prisma.apiAccessToken.create({
      data: { requestId: id, tokenHash, grantedLevel, grantedScope },
    });

    const updated = await this.prisma.apiAccessRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
    });

    const manual = await this.getManualUrl();
    await this.mail.sendApiAccessApproval(request.email, { token: plaintextToken, manualUrl: manual ?? undefined });

    void this.audit.log({
      orgId: '', actorId: reviewerId, action: 'APPROVE_API_ACCESS_REQUEST',
      entity: 'ApiAccessRequest', entityId: id, detail: `level=${grantedLevel}`,
    });

    return { request: updated, plaintextToken };
  }

  async reject(id: string, reviewerId: string, dto: RejectApiAccessRequestDto) {
    const request = await this.prisma.apiAccessRequest.findUnique({ where: { id } });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('ไม่พบคำขอนี้ หรือถูกพิจารณาไปแล้ว');
    }

    const updated = await this.prisma.apiAccessRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: dto.reason },
    });

    await this.mail.sendApiAccessRejection(request.email, { reason: dto.reason });

    void this.audit.log({
      orgId: '', actorId: reviewerId, action: 'REJECT_API_ACCESS_REQUEST',
      entity: 'ApiAccessRequest', entityId: id, detail: dto.reason,
    });

    return updated;
  }

  // ── Manual PDF (single static file, always overwritten) ────────────────
  private manualUrl: string | null = null;

  async uploadManual(fileUrl: string) {
    this.manualUrl = fileUrl;
    return { manualUrl: fileUrl };
  }

  async getManualUrl(): Promise<string | null> {
    return this.manualUrl;
  }

  async listTokens() {
    return this.prisma.apiAccessToken.findMany({
      include: { request: { select: { requesterName: true, requesterOrg: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeToken(id: string, actorId: string) {
    const token = await this.prisma.apiAccessToken.findUnique({ where: { id } });
    if (!token) throw new NotFoundException('ไม่พบ Token นี้');

    const updated = await this.prisma.apiAccessToken.update({
      where: { id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    void this.audit.log({
      orgId: '', actorId, action: 'REVOKE_API_ACCESS_TOKEN', entity: 'ApiAccessToken', entityId: id,
    });

    return updated;
  }
}
