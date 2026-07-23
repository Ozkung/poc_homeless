# Expense Claim (ขอเบิกเงิน) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expense/reimbursement claim feature so CASE_MANAGER and CARE_GIVER can request money (for themselves, a patient, or — CASE_MANAGER only — another Care Giver), reviewed exclusively by SUPER_ADMIN.

**Architecture:** New backend module `expense-claims` (NestJS controller/service/DTOs + Prisma model), mirroring the existing `inventory` module's `AdjRequest` approval workflow (`PENDING → APPROVED/REJECTED`, reviewer field, review note). Three new frontend pages (`(cm)`, `(fw)`, `(admin)` route groups) using the existing "table + create/review modal" pattern seen in `cm/users/page.tsx`.

**Tech Stack:** NestJS + Prisma (PostgreSQL) backend, Next.js + antd frontend, Jest + ts-jest for backend unit tests (mocked `PrismaService`, no e2e infra in this repo).

## Global Constraints

- Multi-tenancy: every query must be scoped by `organizationId`.
- Only `SUPER_ADMIN` may approve/reject claims — enforced via `@Roles(UserRole.SUPER_ADMIN)` on the backend (the real security boundary), not just hidden UI.
- Only `CASE_MANAGER` may set `payeeType = CARE_GIVER`; a `CARE_GIVER` requester may only claim for `SELF` or `PATIENT`.
- No receipt/attachment upload, no LINE push notifications, no auto-approval threshold, no cancel/edit of submitted claims — explicitly out of scope per the design spec at `docs/superpowers/specs/2026-07-23-expense-claims-design.md`.
- Follow existing codebase conventions exactly: class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + method-level `@Roles(...)`, `void this.audit.log(...)` fire-and-forget audit calls, `AuditLogService` is `@Global()` (no need to import `AuditLogModule`).

---

### Task 1: Prisma schema — `ExpenseClaim` model + migration

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `ExpenseClaimStatus` enum (`PENDING | APPROVED | REJECTED`), `ExpensePayeeType` enum (`SELF | PATIENT | CARE_GIVER`), `ExpenseClaim` Prisma model with fields `id, organizationId, requestedById, requestDate, amount, description, additionalNote, payeeType, patientId, payeeId, status, reviewedById, reviewNote, createdAt, updatedAt`. All later tasks depend on these exact field names.

- [ ] **Step 1: Add the two new enums and `ExpenseClaim` model at the end of `schema.prisma`**

Append this to the end of the file (after the existing `model AuditLog { ... }` block):

```prisma

enum ExpenseClaimStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ExpensePayeeType {
  SELF
  PATIENT
  CARE_GIVER
}

model ExpenseClaim {
  id             String             @id @default(uuid())
  organizationId String
  organization   Organization       @relation(fields: [organizationId], references: [id])

  requestedById  String
  requester      User               @relation("ExpenseClaimRequester", fields: [requestedById], references: [id])

  requestDate    DateTime
  amount         Float
  description    String
  additionalNote String?

  payeeType      ExpensePayeeType   @default(SELF)
  patientId      String?
  patient        Patient?           @relation(fields: [patientId], references: [id])
  payeeId        String?
  payee          User?              @relation("ExpenseClaimPayee", fields: [payeeId], references: [id])

  status         ExpenseClaimStatus @default(PENDING)
  reviewedById   String?
  reviewer       User?              @relation("ExpenseClaimReviewer", fields: [reviewedById], references: [id])
  reviewNote     String?

  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([organizationId, status])
}
```

- [ ] **Step 2: Add back-relations on `User`**

In `apps/backend/prisma/schema.prisma`, find the `model User { ... }` block. Its last three lines before the closing `}` currently read:

```prisma
  diagnoses       Diagnosis[]      @relation("DoctorDiagnoses")
  prescriptions   Prescription[]   @relation("DoctorPrescriptions")
  doctorSchedules DoctorSchedule[] @relation("DoctorSchedules")
}
```

Replace with:

```prisma
  diagnoses       Diagnosis[]      @relation("DoctorDiagnoses")
  prescriptions   Prescription[]   @relation("DoctorPrescriptions")
  doctorSchedules DoctorSchedule[] @relation("DoctorSchedules")

  expenseClaimsRequested ExpenseClaim[] @relation("ExpenseClaimRequester")
  expenseClaimsReviewed  ExpenseClaim[] @relation("ExpenseClaimReviewer")
  expenseClaimsReceived  ExpenseClaim[] @relation("ExpenseClaimPayee")
}
```

- [ ] **Step 3: Add back-relation on `Organization`**

Find `model Organization { ... }`. Its relation list currently ends:

```prisma
  zones           Zone[]
  doctorSchedules DoctorSchedule[]
  auditLogs       AuditLog[]
}
```

Replace with:

```prisma
  zones           Zone[]
  doctorSchedules DoctorSchedule[]
  auditLogs       AuditLog[]
  expenseClaims   ExpenseClaim[]
}
```

- [ ] **Step 4: Add back-relation on `Patient`**

Find `model Patient { ... }`. Its relation list currently ends:

```prisma
  submissions         Submission[]
  activities          Activity[]
  eventTasks          EventTask[]
  carePlanItems       CarePlanItem[]
  carePlanAssessments CarePlanAssessment[]
  alerts              Alert[]
  diagnoses           Diagnosis[]
  prescriptions       Prescription[]
}
```

Replace with:

```prisma
  submissions         Submission[]
  activities          Activity[]
  eventTasks          EventTask[]
  carePlanItems       CarePlanItem[]
  carePlanAssessments CarePlanAssessment[]
  alerts              Alert[]
  diagnoses           Diagnosis[]
  prescriptions       Prescription[]
  expenseClaims       ExpenseClaim[]
}
```

- [ ] **Step 5: Run the migration**

From `apps/backend`, run (the running Postgres container listens on host port 5433, per `docker-compose.yml`):

```bash
cd apps/backend
DATABASE_URL="postgresql://homemed:homemed_dev@localhost:5433/homemed" npx prisma migrate dev --name add_expense_claims
```

Expected: prompt-free success ending in `Your database is now in sync with your schema.` and a new folder under `apps/backend/prisma/migrations/` named `<timestamp>_add_expense_claims`. This command also regenerates the Prisma Client (`node_modules/.prisma/client`), which later tasks' TypeScript depends on.

- [ ] **Step 6: Verify the schema compiles and the client has the new types**

```bash
npx prisma validate
npx tsc --noEmit -p tsconfig.json
```

Expected: both commands exit 0 with no output (the `tsc` check will only start passing once later tasks reference `ExpenseClaim` types, so at this point it should still pass since nothing references them yet).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations
git commit -m "feat(db): add ExpenseClaim model for expense claim feature"
```

---

### Task 2: Backend DTOs

**Files:**
- Create: `apps/backend/src/modules/expense-claims/dto/create-expense-claim.dto.ts`
- Create: `apps/backend/src/modules/expense-claims/dto/review-expense-claim.dto.ts`

**Interfaces:**
- Consumes: `ExpensePayeeType` enum from `@prisma/client` (Task 1).
- Produces: `CreateExpenseClaimDto` (fields: `requestDate: string`, `amount: number`, `description: string`, `additionalNote?: string`, `payeeType: ExpensePayeeType`, `patientId?: string`, `payeeId?: string`) and `ReviewExpenseClaimDto` (fields: `status: 'APPROVED' | 'REJECTED'`, `reviewNote?: string`). Task 3 and Task 5 depend on these exact shapes.

No dedicated unit tests for these DTOs — matches the existing convention in this codebase (`AdjRequestDto`/`ReviewAdjDto` in `apps/backend/src/modules/inventory/dto/` have no test files either; validation behavior is exercised indirectly through the service tests in Tasks 3 and 5).

- [ ] **Step 1: Create `CreateExpenseClaimDto`**

```typescript
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ExpensePayeeType } from '@prisma/client';

export class CreateExpenseClaimDto {
  @IsDateString() requestDate: string;
  @IsNumber() @IsPositive() amount: number;
  @IsString() @IsNotEmpty() description: string;
  @IsOptional() @IsString() additionalNote?: string;
  @IsEnum(ExpensePayeeType) payeeType: ExpensePayeeType;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() payeeId?: string;
}
```

- [ ] **Step 2: Create `ReviewExpenseClaimDto`**

```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewExpenseClaimDto {
  @IsEnum(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewNote?: string;
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/expense-claims/dto
git commit -m "feat: add expense claim DTOs"
```

---

### Task 3: `ExpenseClaimsService.create()`

**Files:**
- Create: `apps/backend/src/modules/expense-claims/expense-claims.service.ts`
- Create: `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`

**Interfaces:**
- Consumes: `CreateExpenseClaimDto` (Task 2), `PrismaService` (`apps/backend/src/prisma/prisma.service.ts`), `AuditLogService` (`apps/backend/src/modules/audit-log/audit-log.service.ts`, method `log(data: { orgId, actorId, action, entity, entityId?, detail? })`).
- Produces: `ExpenseClaimsService.create(orgId: string, actorId: string, actorRole: string, dto: CreateExpenseClaimDto): Promise<ExpenseClaim>`. Tasks 4, 5, 6 add more methods to this same class.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ExpenseClaimsService } from '../expense-claims.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockPrisma: any = {
  expenseClaim: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  patient: { findFirst: jest.fn() },
  user: { findFirst: jest.fn() },
};

const mockAuditLog = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('ExpenseClaimsService', () => {
  let service: ExpenseClaimsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExpenseClaimsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();
    service = module.get(ExpenseClaimsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a SELF claim without patient/payee lookups', async () => {
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim1', amount: 500 });

      await service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 500, description: 'ค่าเดินทาง', payeeType: 'SELF',
      } as any);

      expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org1', requestedById: 'user1', amount: 500,
            payeeType: 'SELF', patientId: null, payeeId: null,
          }),
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org1', actorId: 'user1', action: 'SUBMIT_CLAIM', entity: 'ExpenseClaim', entityId: 'claim1' }),
      );
    });

    it('creates a PATIENT claim after validating the patient exists in the org', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'p1' });
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim2', amount: 300 });

      await service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่ายา', payeeType: 'PATIENT', patientId: 'p1',
      } as any);

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', organizationId: 'org1' } }),
      );
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payeeType: 'PATIENT', patientId: 'p1', payeeId: null }) }),
      );
    });

    it('throws BadRequestException when payeeType PATIENT but patientId not found in org', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่ายา', payeeType: 'PATIENT', patientId: 'bad-id',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a CARE_GIVER requester sets payeeType CARE_GIVER', async () => {
      await expect(service.create('org1', 'user1', 'CARE_GIVER', {
        requestDate: '2026-07-23', amount: 300, description: 'ค่าเดินทาง', payeeType: 'CARE_GIVER', payeeId: 'cg2',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('creates a CARE_GIVER claim for a CASE_MANAGER requester after validating the payee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'cg2', role: 'CARE_GIVER' });
      mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim3', amount: 1000 });

      await service.create('org1', 'cm1', 'CASE_MANAGER', {
        requestDate: '2026-07-23', amount: 1000, description: 'ค่าเดินทางของทีม', payeeType: 'CARE_GIVER', payeeId: 'cg2',
      } as any);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cg2', organizationId: 'org1', role: 'CARE_GIVER' } }),
      );
      expect(mockPrisma.expenseClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payeeType: 'CARE_GIVER', payeeId: 'cg2', patientId: null }) }),
      );
    });

    it('throws BadRequestException when payeeType CARE_GIVER but payeeId not a Care Giver in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create('org1', 'cm1', 'CASE_MANAGER', {
        requestDate: '2026-07-23', amount: 1000, description: 'ค่าเดินทาง', payeeType: 'CARE_GIVER', payeeId: 'bad-id',
      } as any)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.expenseClaim.create).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend
npx jest expense-claims.service.spec.ts
```

Expected: FAIL — `Cannot find module '../expense-claims.service'` (file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/src/modules/expense-claims/expense-claims.service.ts`:

```typescript
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
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest expense-claims.service.spec.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/expense-claims/expense-claims.service.ts apps/backend/src/modules/expense-claims/test
git commit -m "feat: add ExpenseClaimsService.create with payee validation rules"
```

---

### Task 4: `ExpenseClaimsService.findMine()` and `findAll()`

**Files:**
- Modify: `apps/backend/src/modules/expense-claims/expense-claims.service.ts`
- Modify: `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`

**Interfaces:**
- Produces: `findMine(userId: string): Promise<ExpenseClaim[]>`, `findAll(orgId: string, status?: string): Promise<ExpenseClaim[]>`. Task 6's controller calls both.

- [ ] **Step 1: Add failing tests**

Add to `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`, inside the `describe('ExpenseClaimsService', ...)` block, after the `create` describe block:

```typescript
  describe('findMine', () => {
    it('returns claims filtered by requestedById, newest first', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([{ id: 'claim1' }]);

      const result = await service.findMine('user1');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedById: 'user1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'claim1' }]);
    });
  });

  describe('findAll', () => {
    it('returns all org claims when no status filter given', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);

      await service.findAll('org1');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org1' } }),
      );
    });

    it('filters by status when provided', async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);

      await service.findAll('org1', 'PENDING');

      expect(mockPrisma.expenseClaim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org1', status: 'PENDING' } }),
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest expense-claims.service.spec.ts
```

Expected: FAIL — `service.findMine is not a function` / `service.findAll is not a function`.

- [ ] **Step 3: Implement `findMine` and `findAll`**

In `apps/backend/src/modules/expense-claims/expense-claims.service.ts`, add these methods to the `ExpenseClaimsService` class, after `create`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest expense-claims.service.spec.ts
```

Expected: PASS — all tests green (create + findMine + findAll).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/expense-claims/expense-claims.service.ts apps/backend/src/modules/expense-claims/test
git commit -m "feat: add ExpenseClaimsService.findMine and findAll"
```

---

### Task 5: `ExpenseClaimsService.review()`

**Files:**
- Modify: `apps/backend/src/modules/expense-claims/expense-claims.service.ts`
- Modify: `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`

**Interfaces:**
- Consumes: `ReviewExpenseClaimDto` (Task 2).
- Produces: `review(claimId: string, reviewerId: string, orgId: string, dto: ReviewExpenseClaimDto): Promise<ExpenseClaim>`. Task 6's controller calls this.

- [ ] **Step 1: Add failing tests**

Add to `apps/backend/src/modules/expense-claims/test/expense-claims.service.spec.ts`, after the `findAll` describe block:

```typescript
  describe('review', () => {
    it('approves a pending claim and logs APPROVE_CLAIM', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue({ id: 'claim1', amount: 500, status: 'PENDING' });
      mockPrisma.expenseClaim.update.mockResolvedValue({ id: 'claim1', status: 'APPROVED' });

      await service.review('claim1', 'sa1', 'org1', { status: 'APPROVED', reviewNote: 'โอนแล้ว' });

      expect(mockPrisma.expenseClaim.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'claim1', organizationId: 'org1', status: 'PENDING' } }),
      );
      expect(mockPrisma.expenseClaim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'claim1' },
          data: { status: 'APPROVED', reviewedById: 'sa1', reviewNote: 'โอนแล้ว' },
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org1', actorId: 'sa1', action: 'APPROVE_CLAIM', entity: 'ExpenseClaim', entityId: 'claim1' }),
      );
    });

    it('rejects a pending claim and logs REJECT_CLAIM', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue({ id: 'claim2', amount: 200, status: 'PENDING' });
      mockPrisma.expenseClaim.update.mockResolvedValue({ id: 'claim2', status: 'REJECTED' });

      await service.review('claim2', 'sa1', 'org1', { status: 'REJECTED' });

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REJECT_CLAIM', entityId: 'claim2' }),
      );
    });

    it('throws NotFoundException when claim is not pending or does not exist', async () => {
      mockPrisma.expenseClaim.findFirst.mockResolvedValue(null);

      await expect(service.review('bad-id', 'sa1', 'org1', { status: 'APPROVED' }))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.expenseClaim.update).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest expense-claims.service.spec.ts
```

Expected: FAIL — `service.review is not a function`.

- [ ] **Step 3: Implement `review`**

In `apps/backend/src/modules/expense-claims/expense-claims.service.ts`, add this method after `findAll`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest expense-claims.service.spec.ts
```

Expected: PASS — all 11 tests green (create ×6, findMine ×1, findAll ×2, review ×3... actually 6+1+2+3 = 12; count doesn't need to match exactly, just confirm all pass with 0 failures).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/expense-claims/expense-claims.service.ts apps/backend/src/modules/expense-claims/test
git commit -m "feat: add ExpenseClaimsService.review with PENDING-only guard"
```

---

### Task 6: Controller, Module, and app registration

**Files:**
- Create: `apps/backend/src/modules/expense-claims/expense-claims.controller.ts`
- Create: `apps/backend/src/modules/expense-claims/expense-claims.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ExpenseClaimsService` (Tasks 3–5), `JwtAuthGuard`/`RolesGuard` (`apps/backend/src/common/guards/`), `Roles` decorator (`apps/backend/src/common/decorators/roles.decorator.ts`), `CurrentUser`/`JwtPayload` (`apps/backend/src/common/decorators/current-user.decorator.ts` — `JwtPayload` has `sub`, `email`, `role: string`, `orgId`).
- Produces: HTTP routes `POST /expense-claims`, `GET /expense-claims/mine`, `GET /expense-claims`, `PATCH /expense-claims/:id/review`.

No new unit tests in this task — the controller is a thin adapter over the already-tested service (same convention as `inventory.controller.ts`, which has no dedicated controller spec). Verification is via type-check plus a manual smoke test.

- [ ] **Step 1: Create the controller**

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ExpenseClaimsService } from './expense-claims.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateExpenseClaimDto } from './dto/create-expense-claim.dto';
import { ReviewExpenseClaimDto } from './dto/review-expense-claim.dto';

@Controller('expense-claims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpenseClaimsController {
  constructor(private claims: ExpenseClaimsService) {}

  @Post()
  @Roles(UserRole.CASE_MANAGER, UserRole.CARE_GIVER)
  create(@Body() dto: CreateExpenseClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.create(user.orgId, user.sub, user.role, dto);
  }

  @Get('mine')
  @Roles(UserRole.CASE_MANAGER, UserRole.CARE_GIVER)
  findMine(@CurrentUser() user: JwtPayload) {
    return this.claims.findMine(user.sub);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.claims.findAll(user.orgId, status);
  }

  @Patch(':id/review')
  @Roles(UserRole.SUPER_ADMIN)
  review(@Param('id') id: string, @Body() dto: ReviewExpenseClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.review(id, user.sub, user.orgId, dto);
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { ExpenseClaimsController } from './expense-claims.controller';
import { ExpenseClaimsService } from './expense-claims.service';

@Module({
  controllers: [ExpenseClaimsController],
  providers: [ExpenseClaimsService],
})
export class ExpenseClaimsModule {}
```

- [ ] **Step 3: Register the module in `app.module.ts`**

In `apps/backend/src/app.module.ts`, add the import alongside the other module imports (near `import { AuditLogModule } from './modules/audit-log/audit-log.module';`):

```typescript
import { ExpenseClaimsModule } from './modules/expense-claims/expense-claims.module';
```

And add `ExpenseClaimsModule` to the `imports` array in the `@Module({...})` decorator, alongside `AuditLogModule`:

```typescript
    AuditLogModule,
    ExpenseClaimsModule,
```

- [ ] **Step 4: Type-check and run the full backend test suite**

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest expense-claims
```

Expected: both exit 0 — no type errors, all `expense-claims` tests still passing.

- [ ] **Step 5: Rebuild and restart the backend container for a manual smoke check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl
docker compose logs --tail=30 backend_hl
```

Expected: log output shows Nest bootstrapping the routes, including lines mapping `expense-claims` (e.g. `Mapped {/expense-claims, POST}`, `Mapped {/expense-claims/mine, GET}`, `Mapped {/expense-claims, GET}`, `Mapped {/expense-claims/:id/review, PATCH}`), with no startup errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/expense-claims/expense-claims.controller.ts apps/backend/src/modules/expense-claims/expense-claims.module.ts apps/backend/src/app.module.ts
git commit -m "feat: wire up expense-claims controller and module"
```

---

### Task 7: Frontend — CASE_MANAGER expense claims page

**Files:**
- Create: `apps/frontend/src/app/(cm)/cm/expense-claims/page.tsx`

**Interfaces:**
- Consumes: `GET /expense-claims/mine`, `POST /expense-claims`, `GET /patients` (existing, returns `{ id, name, hn, status }[]`), `GET /users/care-givers` (existing, returns `{ id, displayName, supervisor?: { displayName } }[]`).

This page has no automated test (no other page in this codebase has frontend tests — verification is manual via the dev server, matching how every other page in this repo is verified).

- [ ] **Step 1: Create the page**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Radio, Select, message, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import { Plus } from 'lucide-react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type PayeeType = 'SELF' | 'PATIENT' | 'CARE_GIVER';
type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseClaim {
  id: string;
  requestDate: string;
  amount: number;
  description: string;
  additionalNote?: string | null;
  payeeType: PayeeType;
  patient?: { id: string; hn: string } | null;
  payee?: { id: string; displayName: string } | null;
  status: ClaimStatus;
  reviewNote?: string | null;
}

const STATUS_COLOR: Record<ClaimStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<ClaimStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function CMExpenseClaimsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [careGivers, setCareGivers] = useState<{ id: string; displayName: string; supervisor?: { displayName: string } | null }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const payeeType: PayeeType = Form.useWatch('payeeType', form) ?? 'SELF';

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_URL}/expense-claims/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setClaims(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/patients`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/users/care-givers`, { headers }).then((r) => r.ok ? r.json() : []),
    ]).then(([p, cg]) => {
      setPatients(Array.isArray(p) ? p : []);
      setCareGivers(Array.isArray(cg) ? cg : []);
    }).catch(() => {});
  }, [token]);

  async function handleCreate() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/expense-claims`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestDate: values.requestDate.toISOString(),
          amount: values.amount,
          description: values.description,
          additionalNote: values.additionalNote || undefined,
          payeeType: values.payeeType,
          patientId: values.payeeType === 'PATIENT' ? values.patientId : undefined,
          payeeId: values.payeeType === 'CARE_GIVER' ? values.payeeId : undefined,
        }),
      });
      if (res.ok) {
        message.success('ส่งคำขอเบิกเงินแล้ว');
        setCreateOpen(false);
        form.resetFields();
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err?.message ?? 'เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'วันที่ขอ', dataIndex: 'requestDate', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'จำนวนเงิน', dataIndex: 'amount', render: (v: number) => `฿${v.toLocaleString()}` },
    { title: 'รายละเอียด', dataIndex: 'description' },
    {
      title: 'เบิกเพื่อ',
      render: (_: any, r: ExpenseClaim) => {
        if (r.payeeType === 'PATIENT') return `ผู้ป่วย (HN ${r.patient?.hn ?? '-'})`;
        if (r.payeeType === 'CARE_GIVER') return `Care Giver: ${r.payee?.displayName ?? '-'}`;
        return 'ตัวเอง';
      },
    },
    { title: 'สถานะ', dataIndex: 'status', render: (v: ClaimStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: 'หมายเหตุจากผู้อนุมัติ', dataIndex: 'reviewNote', render: (v?: string) => v ?? '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอเบิกเงิน</h1>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
          สร้างคำขอเบิกเงิน
        </Button>
      </div>

      <Table dataSource={claims} rowKey="id" size="small" columns={columns} />

      <Modal
        title="สร้างคำขอเบิกเงิน"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        okText="ส่งคำขอ"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ payeeType: 'SELF', requestDate: dayjs() }}>
          <Form.Item name="requestDate" label="วันที่ขอ" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="amount" label="จำนวนเงิน (บาท)" rules={[{ required: true, message: 'กรุณาระบุจำนวนเงิน' }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter="บาท" />
          </Form.Item>
          <Form.Item name="description" label="รายละเอียด (เกิดจากอะไร)" rules={[{ required: true, message: 'กรุณาระบุรายละเอียด' }]}>
            <Input placeholder="เช่น ค่าเดินทางไปเยี่ยมผู้ป่วย" />
          </Form.Item>
          <Form.Item name="additionalNote" label="เหตุผลการเบิก (ถ้ามี)">
            <Input.TextArea rows={2} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" />
          </Form.Item>
          <Form.Item name="payeeType" label="เบิกเพื่อ" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: 'ตัวเอง', value: 'SELF' },
                { label: 'ผู้ป่วย', value: 'PATIENT' },
                { label: 'Care Giver', value: 'CARE_GIVER' },
              ]}
            />
          </Form.Item>
          {payeeType === 'PATIENT' && (
            <Form.Item name="patientId" label="เลือกผู้ป่วย" rules={[{ required: true, message: 'กรุณาเลือกผู้ป่วย' }]}>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="label"
                options={patients.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          )}
          {payeeType === 'CARE_GIVER' && (
            <Form.Item name="payeeId" label="เลือก Care Giver" rules={[{ required: true, message: 'กรุณาเลือก Care Giver' }]}>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="label"
                options={careGivers.map((cg) => ({
                  value: cg.id,
                  label: cg.supervisor ? `${cg.displayName} (ทีม ${cg.supervisor.displayName})` : cg.displayName,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(cm\)/cm/expense-claims
git commit -m "feat: add CASE_MANAGER expense claims page"
```

---

### Task 8: Frontend — CARE_GIVER expense claims page

**Files:**
- Create: `apps/frontend/src/app/(fw)/fw/expense-claims/page.tsx`

**Interfaces:**
- Consumes: same endpoints as Task 7, minus `/users/care-givers` (Care Giver requesters can't claim on behalf of another Care Giver, so no payee picker for that type).

- [ ] **Step 1: Create the page**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Radio, Select, message, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import { Plus } from 'lucide-react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type PayeeType = 'SELF' | 'PATIENT';
type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseClaim {
  id: string;
  requestDate: string;
  amount: number;
  description: string;
  additionalNote?: string | null;
  payeeType: PayeeType;
  patient?: { id: string; hn: string } | null;
  status: ClaimStatus;
  reviewNote?: string | null;
}

const STATUS_COLOR: Record<ClaimStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<ClaimStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function FWExpenseClaimsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const payeeType: PayeeType = Form.useWatch('payeeType', form) ?? 'SELF';

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_URL}/expense-claims/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setClaims(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/patients`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((p) => setPatients(Array.isArray(p) ? p : []))
      .catch(() => {});
  }, [token]);

  async function handleCreate() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/expense-claims`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestDate: values.requestDate.toISOString(),
          amount: values.amount,
          description: values.description,
          additionalNote: values.additionalNote || undefined,
          payeeType: values.payeeType,
          patientId: values.payeeType === 'PATIENT' ? values.patientId : undefined,
        }),
      });
      if (res.ok) {
        message.success('ส่งคำขอเบิกเงินแล้ว');
        setCreateOpen(false);
        form.resetFields();
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err?.message ?? 'เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'วันที่ขอ', dataIndex: 'requestDate', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'จำนวนเงิน', dataIndex: 'amount', render: (v: number) => `฿${v.toLocaleString()}` },
    { title: 'รายละเอียด', dataIndex: 'description' },
    {
      title: 'เบิกเพื่อ',
      render: (_: any, r: ExpenseClaim) => r.payeeType === 'PATIENT' ? `ผู้ป่วย (HN ${r.patient?.hn ?? '-'})` : 'ตัวเอง',
    },
    { title: 'สถานะ', dataIndex: 'status', render: (v: ClaimStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    { title: 'หมายเหตุจากผู้อนุมัติ', dataIndex: 'reviewNote', render: (v?: string) => v ?? '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอเบิกเงิน</h1>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
          สร้างคำขอเบิกเงิน
        </Button>
      </div>

      <Table dataSource={claims} rowKey="id" size="small" columns={columns} />

      <Modal
        title="สร้างคำขอเบิกเงิน"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        okText="ส่งคำขอ"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ payeeType: 'SELF', requestDate: dayjs() }}>
          <Form.Item name="requestDate" label="วันที่ขอ" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="amount" label="จำนวนเงิน (บาท)" rules={[{ required: true, message: 'กรุณาระบุจำนวนเงิน' }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter="บาท" />
          </Form.Item>
          <Form.Item name="description" label="รายละเอียด (เกิดจากอะไร)" rules={[{ required: true, message: 'กรุณาระบุรายละเอียด' }]}>
            <Input placeholder="เช่น ค่าเดินทางไปเยี่ยมผู้ป่วย" />
          </Form.Item>
          <Form.Item name="additionalNote" label="เหตุผลการเบิก (ถ้ามี)">
            <Input.TextArea rows={2} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" />
          </Form.Item>
          <Form.Item name="payeeType" label="เบิกเพื่อ" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: 'ตัวเอง', value: 'SELF' },
                { label: 'ผู้ป่วย', value: 'PATIENT' },
              ]}
            />
          </Form.Item>
          {payeeType === 'PATIENT' && (
            <Form.Item name="patientId" label="เลือกผู้ป่วย" rules={[{ required: true, message: 'กรุณาเลือกผู้ป่วย' }]}>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="label"
                options={patients.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(fw\)/fw/expense-claims
git commit -m "feat: add CARE_GIVER expense claims page"
```

---

### Task 9: Frontend — SUPER_ADMIN approval queue page

**Files:**
- Create: `apps/frontend/src/app/(admin)/admin/expense-claims/page.tsx`

**Interfaces:**
- Consumes: `GET /expense-claims?status=`, `PATCH /expense-claims/:id/review`.

This page lives under the `(admin)` route group, whose `layout.tsx` allows both `ADMIN` and `SUPER_ADMIN`. Per the existing convention observed in `apps/frontend/src/app/(admin)/admin/users/page.tsx` (a SUPER_ADMIN-only page with no client-side role check of its own), this page also adds no extra client-side guard — enforcement is the backend's `@Roles(UserRole.SUPER_ADMIN)` (Task 6), and the nav link is hidden from `ADMIN` (Task 10).

- [ ] **Step 1: Create the page**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Radio, message, Tag, Space } from 'antd';
import { useSession } from 'next-auth/react';
import { Check, X } from 'lucide-react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseClaim {
  id: string;
  requestDate: string;
  amount: number;
  description: string;
  additionalNote?: string | null;
  payeeType: 'SELF' | 'PATIENT' | 'CARE_GIVER';
  requester: { id: string; displayName: string; role: string };
  patient?: { id: string; hn: string } | null;
  payee?: { id: string; displayName: string } | null;
  status: ClaimStatus;
  reviewNote?: string | null;
}

const STATUS_COLOR: Record<ClaimStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<ClaimStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function AdminExpenseClaimsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClaimStatus>('PENDING');
  const [reviewTarget, setReviewTarget] = useState<{ claim: ExpenseClaim; status: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
    const res = await fetch(`${API_URL}/expense-claims${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setClaims(await res.json());
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleReview() {
    if (!reviewTarget) return;
    const values = await reviewForm.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/expense-claims/${reviewTarget.claim.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewTarget.status, reviewNote: values.reviewNote || undefined }),
      });
      if (res.ok) {
        message.success(reviewTarget.status === 'APPROVED' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว');
        setReviewTarget(null);
        reviewForm.resetFields();
        load();
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'ผู้ขอ', render: (_: any, r: ExpenseClaim) => `${r.requester.displayName} (${r.requester.role})` },
    { title: 'วันที่ขอ', dataIndex: 'requestDate', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'จำนวนเงิน', dataIndex: 'amount', render: (v: number) => `฿${v.toLocaleString()}` },
    { title: 'รายละเอียด', dataIndex: 'description' },
    {
      title: 'เบิกเพื่อ',
      render: (_: any, r: ExpenseClaim) => {
        if (r.payeeType === 'PATIENT') return `ผู้ป่วย (HN ${r.patient?.hn ?? '-'})`;
        if (r.payeeType === 'CARE_GIVER') return `Care Giver: ${r.payee?.displayName ?? '-'}`;
        return 'ตัวเอง';
      },
    },
    { title: 'สถานะ', dataIndex: 'status', render: (v: ClaimStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    {
      title: '',
      width: 160,
      render: (_: any, r: ExpenseClaim) => r.status === 'PENDING' ? (
        <Space>
          <Button size="small" icon={<Check size={13} />} onClick={() => setReviewTarget({ claim: r, status: 'APPROVED' })}>อนุมัติ</Button>
          <Button size="small" danger icon={<X size={13} />} onClick={() => setReviewTarget({ claim: r, status: 'REJECTED' })}>ปฏิเสธ</Button>
        </Space>
      ) : (r.reviewNote ?? '-'),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอเบิกเงิน</h1>
        <Radio.Group
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { label: 'รอพิจารณา', value: 'PENDING' },
            { label: 'อนุมัติแล้ว', value: 'APPROVED' },
            { label: 'ไม่อนุมัติ', value: 'REJECTED' },
            { label: 'ทั้งหมด', value: 'ALL' },
          ]}
          optionType="button"
        />
      </div>

      <Table dataSource={claims} rowKey="id" size="small" columns={columns} />

      <Modal
        title={reviewTarget?.status === 'APPROVED' ? 'อนุมัติคำขอเบิกเงิน' : 'ปฏิเสธคำขอเบิกเงิน'}
        open={!!reviewTarget}
        onOk={handleReview}
        onCancel={() => { setReviewTarget(null); reviewForm.resetFields(); }}
        okText="ยืนยัน"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="reviewNote" label="หมายเหตุ (ถ้ามี)">
            <Input.TextArea rows={3} placeholder="ระบุเหตุผล (ไม่บังคับ)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(admin\)/admin/expense-claims
git commit -m "feat: add SUPER_ADMIN expense claims approval queue"
```

---

### Task 10: Nav menu entries

**Files:**
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx` (CASE_MANAGER nav)
- Modify: `apps/frontend/src/components/layout/FWShell.tsx` (CARE_GIVER nav)
- Modify: `apps/frontend/src/components/layout/AdminShell.tsx` (SUPER_ADMIN-only nav)

**Interfaces:**
- Consumes: pages created in Tasks 7–9 (`/cm/expense-claims`, `/fw/expense-claims`, `/admin/expense-claims`).

- [ ] **Step 1: Add the nav entry to `Sidebar.tsx` (CM)**

In `apps/frontend/src/components/layout/Sidebar.tsx`, update the lucide-react import (currently `import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, UserCircle, BarChart3, Package } from 'lucide-react';`) to add `Wallet`:

```typescript
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, UserCircle, BarChart3, Package, Wallet } from 'lucide-react';
```

Then update the `navItems` array — it currently ends with:

```typescript
    { key: '/cm/users',      label: 'ทีมของฉัน',    icon: <Users size={ICON_SIZE} /> },
  ];
```

Replace with:

```typescript
    { key: '/cm/users',      label: 'ทีมของฉัน',    icon: <Users size={ICON_SIZE} /> },
    { key: '/cm/expense-claims', label: 'เบิกเงิน', icon: <Wallet size={ICON_SIZE} /> },
  ];
```

- [ ] **Step 2: Add the nav entry to `FWShell.tsx` (Care Giver)**

In `apps/frontend/src/components/layout/FWShell.tsx`, update the import (currently `import { LayoutDashboard, Users, CheckSquare, UserCircle, LogOut } from 'lucide-react';`):

```typescript
import { LayoutDashboard, Users, CheckSquare, UserCircle, LogOut, Wallet } from 'lucide-react';
```

Then update the `navItems` array — it currently ends with:

```typescript
    { key: '/fw/profile',   label: 'โปรไฟล์',        icon: <UserCircle size={ICON_SIZE} /> },
  ];
```

Replace with:

```typescript
    { key: '/fw/profile',   label: 'โปรไฟล์',        icon: <UserCircle size={ICON_SIZE} /> },
    { key: '/fw/expense-claims', label: 'เบิกเงิน', icon: <Wallet size={ICON_SIZE} /> },
  ];
```

- [ ] **Step 3: Add the SUPER_ADMIN-only nav entry to `AdminShell.tsx`**

In `apps/frontend/src/components/layout/AdminShell.tsx`, update the import (currently `import { LayoutDashboard, Map, Users, LogOut, ClipboardList, UserRound, Package, CalendarDays } from 'lucide-react';`):

```typescript
import { LayoutDashboard, Map, Users, LogOut, ClipboardList, UserRound, Package, CalendarDays, Wallet } from 'lucide-react';
```

Then update the `navItems` array — it currently ends with:

```typescript
    ...(isSuperAdmin ? [{ key: '/admin/users', label: 'ผู้ใช้งาน', icon: <Users size={ICON_SIZE} /> }] : []),
    ...(isSuperAdmin ? [{ key: '/admin/audit-log', label: 'Audit Log', icon: <ClipboardList size={ICON_SIZE} /> }] : []),
  ];
```

Replace with (following the same "hide rather than show a confusing empty page" pattern already used for the two entries above it):

```typescript
    ...(isSuperAdmin ? [{ key: '/admin/users', label: 'ผู้ใช้งาน', icon: <Users size={ICON_SIZE} /> }] : []),
    ...(isSuperAdmin ? [{ key: '/admin/audit-log', label: 'Audit Log', icon: <ClipboardList size={ICON_SIZE} /> }] : []),
    // Approval is SUPER_ADMIN-only on the backend — hide rather than show a confusing empty page
    ...(isSuperAdmin ? [{ key: '/admin/expense-claims', label: 'เบิกเงิน', icon: <Wallet size={ICON_SIZE} /> }] : []),
  ];
```

- [ ] **Step 4: Type-check the frontend**

```bash
cd apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/Sidebar.tsx apps/frontend/src/components/layout/FWShell.tsx apps/frontend/src/components/layout/AdminShell.tsx
git commit -m "feat: add expense claims nav entries for cm/fw/admin"
```

---

### Task 11: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and restart both containers**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl frontend_hl
```

Expected: both containers report `Up` in `docker compose ps`.

- [ ] **Step 2: Manual walkthrough**

Using a browser against the frontend (`https://poc_hl.autratech.net` or the configured local URL):

1. Log in as a `CASE_MANAGER` → go to "เบิกเงิน" in the sidebar → submit a claim with เบิกเพื่อ = ผู้ป่วย, and one with เบิกเพื่อ = Care Giver → confirm both appear in the table as "รอพิจารณา".
2. Log in as a `CARE_GIVER` → go to "เบิกเงิน" → confirm the payee options are only ตัวเอง/ผู้ป่วย (no Care Giver option) → submit one claim.
3. Log in as `SUPER_ADMIN` → go to "เบิกเงิน" → confirm all 3 pending claims appear → approve one, reject one with a reviewNote → confirm they move out of the "รอพิจารณา" filter and into "อนุมัติแล้ว"/"ไม่อนุมัติ".
4. Log in as `ADMIN` (not SUPER_ADMIN) → confirm "เบิกเงิน" does **not** appear in the admin sidebar.
5. Go back to the CASE_MANAGER/CARE_GIVER accounts from steps 1–2 → confirm their claim history table shows the updated status and reviewNote.

Expected: all steps behave as described, with no console errors in the browser devtools network tab (no unexpected 500s).

- [ ] **Step 3: Report results**

No commit for this task — it's a verification checkpoint. If any step fails, go back to the relevant earlier task and fix before considering the feature done.

---

## Self-Review Notes

- **Spec coverage:** requestDate ✓ (Task 1 field + Task 7/8 form), amount ✓, required description ✓, optional additionalNote ✓, patient required when payeeType=PATIENT ✓ (Task 3 validation), CASE_MANAGER-only payeeType=CARE_GIVER ✓ (Task 3), SUPER_ADMIN-only approval ✓ (Task 6 `@Roles`), 3-state status ✓ (Task 1 enum), org-wide Care Giver picker ✓ (Task 7 reuses `/users/care-givers`), audit logging ✓ (Task 3 & 5).
- **Placeholder scan:** none found — every step has complete, runnable code.
- **Type consistency:** `ExpenseClaimsService.create/findMine/findAll/review` signatures match between service (Tasks 3–5) and controller (Task 6) call sites. `ExpensePayeeType`/`ExpenseClaimStatus` enum values (`SELF/PATIENT/CARE_GIVER`, `PENDING/APPROVED/REJECTED`) are consistent across schema, DTOs, service, and both frontend pages.
