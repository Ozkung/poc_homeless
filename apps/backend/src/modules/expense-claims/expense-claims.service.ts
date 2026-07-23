import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateExpenseClaimDto } from './dto/create-expense-claim.dto';
import { ReviewExpenseClaimDto } from './dto/review-expense-claim.dto';

@Injectable()
export class ExpenseClaimsService {
  constructor(private prisma: PrismaService, private audit: AuditLogService) {}

  async create(orgId: string, actorId: string, actorRole: string, dto: CreateExpenseClaimDto) {
    if (dto.payeeType === 'CARE_GIVER' && actorRole !== 'CASE_MANAGER') {
      throw new BadRequestException('เฉพาะ Case Manager เท่านั้นที่เบิกแทน Care Giver ได้');
    }

    if (dto.payeeType === 'PATIENT') {
      if (!dto.patientId) throw new BadRequestException('กรุณาระบุผู้ป่วย');
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, organizationId: orgId },
      });
      if (!patient) throw new BadRequestException('ไม่พบผู้ป่วยนี้ในองค์กร');
    }

    if (dto.payeeType === 'CARE_GIVER') {
      if (!dto.payeeId) throw new BadRequestException('กรุณาระบุ Care Giver ที่เบิกแทน');
      const payee = await this.prisma.user.findFirst({
        where: { id: dto.payeeId, organizationId: orgId, role: 'CARE_GIVER' },
      });
      if (!payee) throw new BadRequestException('ไม่พบ Care Giver นี้ในองค์กร');
    }

    const claim = await this.prisma.expenseClaim.create({
      data: {
        organizationId: orgId,
        requestedById: actorId,
        requestDate: new Date(dto.requestDate),
        amount: dto.amount,
        description: dto.description,
        additionalNote: dto.additionalNote,
        payeeType: dto.payeeType,
        patientId: dto.payeeType === 'PATIENT' ? dto.patientId : null,
        payeeId: dto.payeeType === 'CARE_GIVER' ? dto.payeeId : null,
      },
    });

    void this.audit.log({
      orgId, actorId, action: 'SUBMIT_CLAIM', entity: 'ExpenseClaim', entityId: claim.id,
      detail: `฿${dto.amount} — ${dto.description}`,
    });

    return claim;
  }

  async findMine(userId: string) {
    return this.prisma.expenseClaim.findMany({
      where: { requestedById: userId },
      include: {
        patient: { select: { id: true, hn: true } },
        payee: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(orgId: string, status?: string) {
    return this.prisma.expenseClaim.findMany({
      where: { organizationId: orgId, ...(status ? { status: status as any } : {}) },
      include: {
        requester: { select: { id: true, displayName: true, role: true } },
        patient: { select: { id: true, hn: true } },
        payee: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async review(claimId: string, reviewerId: string, orgId: string, dto: ReviewExpenseClaimDto) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id: claimId, organizationId: orgId, status: 'PENDING' },
    });
    if (!claim) throw new NotFoundException('ไม่พบคำขอเบิกเงินนี้ หรือถูกพิจารณาไปแล้ว');

    const updated = await this.prisma.expenseClaim.update({
      where: { id: claimId },
      data: { status: dto.status, reviewedById: reviewerId, reviewNote: dto.reviewNote },
    });

    void this.audit.log({
      orgId, actorId: reviewerId,
      action: dto.status === 'APPROVED' ? 'APPROVE_CLAIM' : 'REJECT_CLAIM',
      entity: 'ExpenseClaim', entityId: claimId,
      detail: `฿${claim.amount} — ${dto.status}${dto.reviewNote ? `: ${dto.reviewNote}` : ''}`,
    });

    return updated;
  }
}
