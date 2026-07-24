# Open API Access Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public request page where external parties request Open API access (justification file, contact info, usage level, entity/column checklist), a SuperAdmin review screen that can approve (issuing a revocable opaque token, emailed automatically) or reject (emailed with an optional reason), and a token-management screen for instant revocation.

**Architecture:** New backend module `api-access` (public submission + SuperAdmin review + token management endpoints, mirroring the existing `expense-claims` module's PENDING/APPROVED/REJECTED pattern) plus a new `mail` module (this codebase's first email-sending capability, via `nodemailer`). New frontend pages: one public unauthenticated page, three SuperAdmin pages under the existing `(admin)` route group, sharing one checkbox-tree component driven by a backend-served entity/column catalog.

**Tech Stack:** NestJS 10, Prisma 6, `@nestjs/throttler` (already installed, reused), `nodemailer` (new dependency), Next.js App Router + antd (existing frontend stack).

## Global Constraints

- **Out of scope, explicitly** (do not build): the actual external-facing data API endpoints a token would call to read/write data; real Swagger/OpenAPI doc generation (only a `SWAGGER_DOCS_URL` link placeholder); a requester-facing status-lookup page.
- One usage level (`VIEW` or `CREATE_UPDATE`) applies to the whole request/token, never per-entity.
- SuperAdmin can narrow (never widen beyond what the catalog allows) the granted level/scope at approval time; approve is otherwise as-requested-or-edited, reject is binary with an optional reason — no partial states.
- The plaintext token is never persisted anywhere — only its SHA-256 hash. It is returned once in the approve API response (for the SuperAdmin's one-time on-screen copy) and once in the approval email body — never logged, never re-displayed.
- No `expiresAt`/scheduled expiry — token lifecycle is `isRevoked` (boolean) + `revokedAt`, an instant on/off action.
- The entity/column catalog (Patient, Diagnosis, Prescription, CarePlanItem, Activity, DoctorSchedule, CareGiver) is a fixed, code-defined TypeScript const — not stored in the database, not user-editable — and is the single source of truth both the public form and the SuperAdmin screen render their checkboxes from.
- Public submission endpoint is rate-limited (3 requests per IP per hour) using the already-installed `@nestjs/throttler` (v6.5.0) — no new dependency for this.
- Email is sent synchronously within the approve/reject request handler (not via the existing Bull queue, which is reserved for bulk/retryable LINE notifications).
- SMTP credentials are placeholders (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` env vars) — the code path must be correct and complete, but sending will only succeed once real credentials are filled in later; do not block implementation on having real credentials.
- All new Prisma migrations must be created with the database reachable at `postgresql://homemed:homemed_dev@localhost:5433/homemed` (the docker-compose `postgres_hl` service's host-mapped port — **not** port 5432, which is what the repo's root `.env` incorrectly shows as a stale default). Always run migration commands with an explicit `DATABASE_URL` override as shown in Task 1, from the host machine (not inside a container — the backend container has no bind-mount for `prisma/migrations`, so files created via `docker compose exec` would be lost on rebuild).
- Follow this codebase's existing patterns exactly where one exists: `RolesGuard`/`@Roles()`/`JwtAuthGuard` for SuperAdmin-only endpoints, `AuditLogService.log()` for state-change audit trail, multer `diskStorage` + UUID filenames for file uploads, `ConfigService.get('section.key')` (nested `configuration()` factory object) for env access, class-validator DTOs with `@IsString()`/`@IsOptional()`/`@IsEnum()` style.

---

### Task 1: Data model — Prisma schema, migration, and the entity/column catalog

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/src/modules/api-access/column-catalog.ts`
- Test: `apps/backend/src/modules/api-access/test/column-catalog.spec.ts`
- Modify: `apps/backend/src/config/configuration.ts` (add `mail` config section + `swaggerDocsUrl`)
- Modify: `.env.example` (document new env vars)

**Interfaces:**
- Consumes: nothing new.
- Produces: Prisma models `ApiAccessRequest`, `ApiAccessToken`, enums `ApiAccessRequestStatus` (`PENDING`/`APPROVED`/`REJECTED`), `ApiAccessLevel` (`VIEW`/`CREATE_UPDATE`) — consumed by every later backend task. `column-catalog.ts` exports `API_ACCESS_CATALOG: Record<string, string[]>` and `isValidScope(scope: Record<string, string[]>): boolean` — consumed by Task 3 (request creation validation) and Task 4 (approval scope validation, catalog endpoint).

- [ ] **Step 1: Add the new enums and models to the Prisma schema**

Open `apps/backend/prisma/schema.prisma`. Find the `User` model (starts at the line beginning `model User {`). Inside it, find this block near the end of the model body:

```prisma
  expenseClaimsRequested ExpenseClaim[] @relation("ExpenseClaimRequester")
  expenseClaimsReviewed  ExpenseClaim[] @relation("ExpenseClaimReviewer")
  expenseClaimsReceived  ExpenseClaim[] @relation("ExpenseClaimPayee")
}
```

Replace it with (adding one new relation line before the closing brace):

```prisma
  expenseClaimsRequested ExpenseClaim[] @relation("ExpenseClaimRequester")
  expenseClaimsReviewed  ExpenseClaim[] @relation("ExpenseClaimReviewer")
  expenseClaimsReceived  ExpenseClaim[] @relation("ExpenseClaimPayee")

  apiAccessRequestsReviewed ApiAccessRequest[] @relation("ApiAccessReviewer")
}
```

Then, at the very end of the file (after the last model, `ExpenseClaim`), append:

```prisma

enum ApiAccessRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ApiAccessLevel {
  VIEW
  CREATE_UPDATE
}

model ApiAccessRequest {
  id                    String                  @id @default(uuid())
  requesterName         String
  requesterOrg          String?
  email                 String
  phone                 String
  justificationFileUrl  String
  requestedLevel        ApiAccessLevel
  requestedScope        Json
  status                ApiAccessRequestStatus  @default(PENDING)
  rejectionReason       String?
  reviewedById          String?
  reviewer              User?                   @relation("ApiAccessReviewer", fields: [reviewedById], references: [id])
  reviewedAt            DateTime?
  token                 ApiAccessToken?
  createdAt             DateTime                @default(now())

  @@index([status])
}

model ApiAccessToken {
  id            String            @id @default(uuid())
  requestId     String            @unique
  request       ApiAccessRequest  @relation(fields: [requestId], references: [id])
  tokenHash     String            @unique
  grantedLevel  ApiAccessLevel
  grantedScope  Json
  isRevoked     Boolean           @default(false)
  revokedAt     DateTime?
  createdAt     DateTime          @default(now())
}
```

- [ ] **Step 2: Create the migration**

Ensure `postgres_hl` is running (`docker compose up -d postgres_hl` from the repo root if not already up — check with `docker compose ps`). Then, from the host machine (not inside a container):

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
DATABASE_URL="postgresql://homemed:homemed_dev@localhost:5433/homemed" npx prisma migrate dev --name add_api_access_requests
```

Expected: `The following migration(s) have been created and applied` followed by a new folder under `apps/backend/prisma/migrations/` named `<timestamp>_add_api_access_requests`, and no errors. Confirm with:

```bash
ls apps/backend/prisma/migrations/ | tail -3
```

Expected: the new migration folder is the most recent entry.

- [ ] **Step 3: Add the `mail` config section and `swaggerDocsUrl` to `configuration.ts`**

Open `apps/backend/src/config/configuration.ts`. In the `validationSchema` object, add these lines (all optional/allow-empty, since real SMTP credentials aren't available yet — the app must still boot without them):

```typescript
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().allow('').default(''),
  SWAGGER_DOCS_URL: Joi.string().allow('').default(''),
```

In the default-export config object (the one returning `{ port, database, redis, jwt, encryption, line, frontendUrl }`), add two new top-level keys — after the `frontendUrl` line:

```typescript
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
  },
  swaggerDocsUrl: process.env.SWAGGER_DOCS_URL ?? '',
```

(Note: `frontendUrl` already exists as the last line before the closing `});` — just add the two new keys after it, don't duplicate `frontendUrl` itself.)

- [ ] **Step 4: Document the new env vars in `.env.example`**

Open `.env.example`. After the `FRONTEND_URL=http://localhost:3000` line (inside the `# ─── Backend (NestJS) ───` section), add:

```bash
# ─── Mail (Open API access notifications) ─────────────────────────────────
# Left blank until real SMTP credentials are available — email sending is a
# no-op (fails silently, logged) until these are filled in.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
# Placeholder link sent in approval emails until real Swagger hosting exists.
SWAGGER_DOCS_URL=
```

- [ ] **Step 5: Create the entity/column catalog**

Create `apps/backend/src/modules/api-access/column-catalog.ts`:

```typescript
export const API_ACCESS_CATALOG: Record<string, string[]> = {
  Patient: [
    'name', 'nationalId', 'hn', 'age', 'gender', 'status', 'conditions',
    'phone', 'locationText', 'birthDate', 'followUpTarget', 'photoUrl',
  ],
  Diagnosis: [
    'title', 'description', 'icd10', 'severity', 'chiefComplaint',
    'presentIllness', 'physicalExam', 'treatmentPlan', 'createdAt',
  ],
  Prescription: ['medications', 'notes', 'createdAt'],
  CarePlanItem: ['title', 'frequency', 'priority', 'assigneeName', 'isDone', 'createdAt'],
  Activity: ['type', 'payload', 'createdAt'],
  DoctorSchedule: ['date', 'startTime', 'endTime', 'location', 'notes'],
  CareGiver: ['displayName', 'phone', 'email', 'zoneId', 'specialty', 'isActive'],
};

export function isValidScope(scope: Record<string, string[]>): boolean {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) return false;
  for (const [entity, columns] of Object.entries(scope)) {
    const allowedColumns = API_ACCESS_CATALOG[entity];
    if (!allowedColumns) return false;
    if (!Array.isArray(columns) || columns.length === 0) return false;
    if (!columns.every((c) => allowedColumns.includes(c))) return false;
  }
  return Object.keys(scope).length > 0;
}
```

- [ ] **Step 6: Write the catalog test**

Create `apps/backend/src/modules/api-access/test/column-catalog.spec.ts`:

```typescript
import { API_ACCESS_CATALOG, isValidScope } from '../column-catalog';

describe('API_ACCESS_CATALOG', () => {
  it('has a non-empty column list for every entity', () => {
    for (const columns of Object.values(API_ACCESS_CATALOG)) {
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
    }
  });

  it('includes all 7 confirmed entities', () => {
    expect(Object.keys(API_ACCESS_CATALOG).sort()).toEqual(
      ['Activity', 'CareGiver', 'CarePlanItem', 'Diagnosis', 'DoctorSchedule', 'Patient', 'Prescription'].sort(),
    );
  });
});

describe('isValidScope', () => {
  it('accepts a scope using only catalog entities and columns', () => {
    expect(isValidScope({ Patient: ['hn', 'age'] })).toBe(true);
  });

  it('rejects a scope with an unknown entity', () => {
    expect(isValidScope({ NotAModel: ['x'] })).toBe(false);
  });

  it('rejects a scope with an unknown column on a known entity', () => {
    expect(isValidScope({ Patient: ['hn', 'notAColumn'] })).toBe(false);
  });

  it('rejects an empty scope', () => {
    expect(isValidScope({})).toBe(false);
  });

  it('rejects a scope where an entity has an empty column list', () => {
    expect(isValidScope({ Patient: [] })).toBe(false);
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest column-catalog.spec.ts
```

Expected: all 7 tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations apps/backend/src/config/configuration.ts .env.example apps/backend/src/modules/api-access/column-catalog.ts apps/backend/src/modules/api-access/test/column-catalog.spec.ts
git commit -m "feat: add Open API access request data model and entity/column catalog"
```

---

### Task 2: Mail module (nodemailer)

**Files:**
- Create: `apps/backend/src/modules/mail/mail.module.ts`
- Create: `apps/backend/src/modules/mail/mail.service.ts`
- Test: `apps/backend/src/modules/mail/test/mail.service.spec.ts`
- Modify: `apps/backend/package.json` (add `nodemailer` + `@types/nodemailer`)

**Interfaces:**
- Consumes: `ConfigService.get('mail.*')` and `ConfigService.get('swaggerDocsUrl')` from Task 1's `configuration.ts` changes.
- Produces: `MailService` with methods `sendApiAccessApproval(to: string, params: { token: string; manualUrl?: string }): Promise<void>` and `sendApiAccessRejection(to: string, params: { reason?: string }): Promise<void>` — consumed by Task 4's approve/reject handlers. `MailModule` — imported by Task 4's `ApiAccessModule`.

- [ ] **Step 1: Install nodemailer**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: both packages added to `apps/backend/package.json` dependencies/devDependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/modules/mail/test/mail.service.spec.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest mail.service.spec.ts
```

Expected: FAIL with "Cannot find module '../mail.service'".

- [ ] **Step 4: Implement `MailService`**

Create `apps/backend/src/modules/mail/mail.service.ts`:

```typescript
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
```

Create `apps/backend/src/modules/mail/mail.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest mail.service.spec.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/package.json apps/backend/package-lock.json apps/backend/src/modules/mail
git commit -m "feat: add mail module with nodemailer for Open API access notifications"
```

---

### Task 3: Public request submission (create + catalog endpoints)

**Files:**
- Create: `apps/backend/src/modules/api-access/dto/create-api-access-request.dto.ts`
- Create: `apps/backend/src/modules/api-access/api-access.service.ts`
- Create: `apps/backend/src/modules/api-access/api-access.controller.ts`
- Create: `apps/backend/src/modules/api-access/api-access.module.ts`
- Test: `apps/backend/src/modules/api-access/test/api-access-create.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts` (register `ApiAccessModule`)

**Interfaces:**
- Consumes: `API_ACCESS_CATALOG`/`isValidScope` (Task 1), `PrismaService` (existing).
- Produces: `ApiAccessService.create(dto, justificationFileUrl): Promise<ApiAccessRequest>` and `ApiAccessService.getCatalog(): Record<string, string[]>` — the `findAll`/`findOne`/`approve`/`reject` methods are added to this same service/controller in Task 4, so name this class `ApiAccessService` (not e.g. `ApiAccessRequestService`) since Task 4 extends it in place. `POST /api-access-requests` and `GET /api-access-requests/catalog` — consumed by the frontend public page (Task 7).

- [ ] **Step 1: Write the DTO**

Create `apps/backend/src/modules/api-access/dto/create-api-access-request.dto.ts`:

```typescript
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiAccessLevel } from '@prisma/client';

export class CreateApiAccessRequestDto {
  @IsString() @IsNotEmpty() requesterName: string;
  @IsOptional() @IsString() requesterOrg?: string;
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsEnum(ApiAccessLevel) requestedLevel: ApiAccessLevel;
  // JSON-encoded Record<string, string[]> — multipart form fields arrive as strings;
  // parsed and validated against the catalog in ApiAccessService.create().
  @IsString() @IsNotEmpty() requestedScope: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/modules/api-access/test/api-access-create.service.spec.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-create.service.spec.ts
```

Expected: FAIL with "Cannot find module '../api-access.service'".

- [ ] **Step 4: Implement `ApiAccessService` (create + getCatalog only — approve/reject/tokens added in Task 4)**

Create `apps/backend/src/modules/api-access/api-access.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { API_ACCESS_CATALOG, isValidScope } from './column-catalog';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';

@Injectable()
export class ApiAccessService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

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
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-create.service.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Implement the controller with file upload and rate limiting**

Create `apps/backend/src/modules/api-access/api-access.controller.ts`:

```typescript
import {
  BadRequestException, Body, Controller, Get, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ApiAccessService } from './api-access.service';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';

const ALLOWED_JUSTIFICATION_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_JUSTIFICATION_SIZE = 10 * 1024 * 1024; // 10MB, matches nginx client_max_body_size

const justificationStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'api-access', 'justifications'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('api-access-requests')
export class ApiAccessController {
  constructor(private apiAccess: ApiAccessService) {}

  @Get('catalog')
  getCatalog() {
    return this.apiAccess.getCatalog();
  }

  @Post()
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @UseInterceptors(
    FileInterceptor('justificationFile', {
      storage: justificationStorage,
      limits: { fileSize: MAX_JUSTIFICATION_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_JUSTIFICATION_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('รองรับเฉพาะไฟล์ PDF, DOC, DOCX'), false);
        }
      },
    }),
  )
  async create(@Body() dto: CreateApiAccessRequestDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์ยื่นความประสงค์');
    const justificationFileUrl = `/uploads/api-access/justifications/${file.filename}`;
    const request = await this.apiAccess.create(dto, justificationFileUrl);
    return { id: request.id, status: request.status };
  }
}
```

Create `apps/backend/src/modules/api-access/api-access.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ApiAccessService } from './api-access.service';
import { ApiAccessController } from './api-access.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [ApiAccessController],
  providers: [ApiAccessService],
})
export class ApiAccessModule {}
```

- [ ] **Step 7: Register the module in `app.module.ts`**

Open `apps/backend/src/app.module.ts`. Add the import line near the other feature-module imports:

```typescript
import { ApiAccessModule } from './modules/api-access/api-access.module';
```

Add `ApiAccessModule` to the end of the `imports` array (after `ExpenseClaimsModule`):

```typescript
    ExpenseClaimsModule,
    ApiAccessModule,
```

- [ ] **Step 8: Type-check and run the full backend suite**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. Jest shows the new tests passing, with only the two pre-existing unrelated failures (`users.service.spec.ts`, `patients.service.spec.ts`) — no new regressions.

- [ ] **Step 9: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/src/modules/api-access apps/backend/src/app.module.ts
git commit -m "feat: add public Open API access request submission endpoint"
```

---

### Task 4: SuperAdmin review — list, detail, approve, reject, manual PDF upload

**Files:**
- Create: `apps/backend/src/modules/api-access/dto/approve-api-access-request.dto.ts`
- Create: `apps/backend/src/modules/api-access/dto/reject-api-access-request.dto.ts`
- Modify: `apps/backend/src/modules/api-access/api-access.service.ts`
- Modify: `apps/backend/src/modules/api-access/api-access.controller.ts`
- Test: `apps/backend/src/modules/api-access/test/api-access-review.service.spec.ts`

**Interfaces:**
- Consumes: `ApiAccessService`/`ApiAccessController` (Task 3), `MailService.sendApiAccessApproval`/`sendApiAccessRejection` (Task 2), `AuditLogService.log()` (existing, signature `{ orgId, actorId, action, entity, entityId?, detail? }` — note this feature has no `organizationId` concept since requesters are external; pass an empty string `''` for `orgId`, matching how this field is genuinely inapplicable here), `JwtAuthGuard`/`RolesGuard`/`@Roles()`/`@CurrentUser()` (existing).
- Produces: `ApiAccessService.findAll(status?)`, `findOne(id)`, `approve(id, reviewerId, dto)` returning `{ request, plaintextToken }`, `reject(id, reviewerId, dto)`, `uploadManual(fileUrl)` — consumed by Task 5 (token listing continues in the same service) and the frontend admin pages (Task 8).

- [ ] **Step 1: Write the approve/reject DTOs**

Create `apps/backend/src/modules/api-access/dto/approve-api-access-request.dto.ts`:

```typescript
import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiAccessLevel } from '@prisma/client';

export class ApproveApiAccessRequestDto {
  @IsOptional() @IsEnum(ApiAccessLevel) grantedLevel?: ApiAccessLevel;
  @IsOptional() @IsObject() grantedScope?: Record<string, string[]>;
}
```

Create `apps/backend/src/modules/api-access/dto/reject-api-access-request.dto.ts`:

```typescript
import { IsOptional, IsString } from 'class-validator';

export class RejectApiAccessRequestDto {
  @IsOptional() @IsString() reason?: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/backend/src/modules/api-access/test/api-access-review.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiAccessService } from '../api-access.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const mockPrisma: any = {
  apiAccessRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  apiAccessToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
};
const mockMail = { sendApiAccessApproval: jest.fn(), sendApiAccessRejection: jest.fn() };
const mockAudit = { log: jest.fn() };

describe('ApiAccessService — review', () => {
  let service: ApiAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApiAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ApiAccessService);
  });

  describe('approve', () => {
    it('creates a token, hashes it, never returns the hash as the plaintext, and emails the requester', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1', status: 'APPROVED' });

      const result = await service.approve('req1', 'admin1', {});

      expect(result.plaintextToken).toBeDefined();
      expect(typeof result.plaintextToken).toBe('string');
      expect(result.plaintextToken.length).toBeGreaterThanOrEqual(32);

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toBe(result.plaintextToken);
      expect(createCall.data.tokenHash).toHaveLength(64); // sha256 hex digest

      expect(mockPrisma.apiAccessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'req1' }, data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'admin1' }) }),
      );
      expect(mockMail.sendApiAccessApproval).toHaveBeenCalledWith('r@example.com', expect.objectContaining({ token: result.plaintextToken }));
    });

    it('defaults granted level/scope to the requested values when not overridden', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'admin1', {});

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.grantedLevel).toBe('VIEW');
      expect(createCall.data.grantedScope).toEqual({ Patient: ['hn'] });
    });

    it('allows SuperAdmin to narrow the granted scope', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'CREATE_UPDATE', requestedScope: { Patient: ['hn', 'age'] },
      });
      mockPrisma.apiAccessToken.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tok1', ...data }));
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1' });

      await service.approve('req1', 'admin1', { grantedLevel: 'VIEW', grantedScope: { Patient: ['hn'] } });

      const createCall = mockPrisma.apiAccessToken.create.mock.calls[0][0];
      expect(createCall.data.grantedLevel).toBe('VIEW');
      expect(createCall.data.grantedScope).toEqual({ Patient: ['hn'] });
    });

    it('rejects a narrowed scope containing an entity/column outside the catalog', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({
        id: 'req1', status: 'PENDING', email: 'r@example.com',
        requestedLevel: 'VIEW', requestedScope: { Patient: ['hn'] },
      });

      await expect(
        service.approve('req1', 'admin1', { grantedScope: { NotAModel: ['x'] } }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.apiAccessToken.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the request is not PENDING', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'APPROVED' });

      await expect(service.approve('req1', 'admin1', {})).rejects.toThrow(NotFoundException);
      expect(mockPrisma.apiAccessToken.create).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('marks the request REJECTED and emails the requester with the reason', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'PENDING', email: 'r@example.com' });
      mockPrisma.apiAccessRequest.update.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      await service.reject('req1', 'admin1', { reason: 'ข้อมูลไม่ครบถ้วน' });

      expect(mockPrisma.apiAccessRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'req1' }, data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'ข้อมูลไม่ครบถ้วน' }) }),
      );
      expect(mockMail.sendApiAccessRejection).toHaveBeenCalledWith('r@example.com', { reason: 'ข้อมูลไม่ครบถ้วน' });
    });

    it('throws NotFoundException when the request is not PENDING', async () => {
      mockPrisma.apiAccessRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      await expect(service.reject('req1', 'admin1', {})).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-review.service.spec.ts
```

Expected: FAIL — `service.approve is not a function` / `service.reject is not a function`.

- [ ] **Step 4: Implement `approve`, `reject`, `findAll`, `findOne`, `uploadManual` in `ApiAccessService`**

Modify `apps/backend/src/modules/api-access/api-access.service.ts`. Add these imports at the top (alongside the existing ones):

```typescript
import { NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ApproveApiAccessRequestDto } from './dto/approve-api-access-request.dto';
import { RejectApiAccessRequestDto } from './dto/reject-api-access-request.dto';
```

Change the constructor to also inject `AuditLogService`:

```typescript
  constructor(private prisma: PrismaService, private mail: MailService, private audit: AuditLogService) {}
```

Add these methods to the class, after `create()`:

```typescript
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
```

Note: `manualUrl` is held in memory (not persisted to Prisma) since it is always exactly one file at a fixed path (`/uploads/api-access/manual.pdf`) that gets overwritten on each upload — the file's existence on disk *is* the state. On process restart, `getManualUrl()` returning `null` until the next upload just means the approval email temporarily omits the manual link, which is acceptable (SuperAdmin re-uploads once after a deploy if needed). This avoids a migration for a single nullable string.

Add the `BadRequestException` import if not already present at the top of the file (it should already be there from Task 3's `parseAndValidateScope`).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-review.service.spec.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Add the controller endpoints**

Modify `apps/backend/src/modules/api-access/api-access.controller.ts`. Add these imports:

```typescript
import { Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ApproveApiAccessRequestDto } from './dto/approve-api-access-request.dto';
import { RejectApiAccessRequestDto } from './dto/reject-api-access-request.dto';
```

(Merge these with the existing `@nestjs/common` import line rather than duplicating it — the final import line should read:
`import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';`)

Add these methods to the `ApiAccessController` class, after the existing `create()` method:

```typescript
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query('status') status?: string) {
    return this.apiAccess.findAll(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.apiAccess.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @Body() dto: ApproveApiAccessRequestDto, @CurrentUser() user: JwtPayload) {
    return this.apiAccess.approve(id, user.sub, dto);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  reject(@Param('id') id: string, @Body() dto: RejectApiAccessRequestDto, @CurrentUser() user: JwtPayload) {
    return this.apiAccess.reject(id, user.sub, dto);
  }

  @Patch('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('manual', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'api-access'),
        filename: (_req, _file, cb) => cb(null, 'manual.pdf'),
      }),
      limits: { fileSize: MAX_JUSTIFICATION_SIZE },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new BadRequestException('รองรับเฉพาะไฟล์ PDF'), false);
        }
      },
    }),
  )
  async uploadManual(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์คู่มือ');
    return this.apiAccess.uploadManual(`/uploads/api-access/manual.pdf`);
  }
```

Update `ApiAccessModule` to import `AuditLogModule` (check `apps/backend/src/modules/audit-log/audit-log.module.ts` exports `AuditLogService` — mirror how `ExpenseClaimsModule` imports it):

```typescript
import { AuditLogModule } from '../audit-log/audit-log.module';
```

```typescript
@Module({
  imports: [MailModule, AuditLogModule],
  controllers: [ApiAccessController],
  providers: [ApiAccessService],
})
export class ApiAccessModule {}
```

- [ ] **Step 7: Type-check and run the full backend suite**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. All `api-access` tests pass; only the same 2 pre-existing unrelated failures remain.

- [ ] **Step 8: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/src/modules/api-access
git commit -m "feat: add SuperAdmin review (approve/reject) and manual PDF upload for API access requests"
```

---

### Task 5: Token management (list + revoke)

**Files:**
- Modify: `apps/backend/src/modules/api-access/api-access.service.ts`
- Modify: `apps/backend/src/modules/api-access/api-access.controller.ts`
- Test: `apps/backend/src/modules/api-access/test/api-access-tokens.service.spec.ts`

**Interfaces:**
- Consumes: `ApiAccessService` (Tasks 3-4).
- Produces: `ApiAccessService.listTokens()`, `revokeToken(id, actorId)` — consumed by the frontend admin tokens page (Task 9). `GET /api-access-tokens`, `PATCH /api-access-tokens/:id/revoke`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/api-access/test/api-access-tokens.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiAccessService } from '../api-access.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const mockPrisma: any = {
  apiAccessRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  apiAccessToken: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
const mockMail = { sendApiAccessApproval: jest.fn(), sendApiAccessRejection: jest.fn() };
const mockAudit = { log: jest.fn() };

describe('ApiAccessService — tokens', () => {
  let service: ApiAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ApiAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ApiAccessService);
  });

  describe('listTokens', () => {
    it('returns all tokens with their request info', async () => {
      mockPrisma.apiAccessToken.findMany.mockResolvedValue([{ id: 'tok1', isRevoked: false }]);

      const result = await service.listTokens();

      expect(result).toEqual([{ id: 'tok1', isRevoked: false }]);
      expect(mockPrisma.apiAccessToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ request: expect.anything() }) }),
      );
    });
  });

  describe('revokeToken', () => {
    it('marks a token revoked and sets revokedAt', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue({ id: 'tok1', isRevoked: false });
      mockPrisma.apiAccessToken.update.mockResolvedValue({ id: 'tok1', isRevoked: true });

      await service.revokeToken('tok1', 'admin1');

      expect(mockPrisma.apiAccessToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tok1' }, data: expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }) }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVOKE_API_ACCESS_TOKEN', entityId: 'tok1' }));
    });

    it('throws NotFoundException for an unknown token id', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue(null);

      await expect(service.revokeToken('nope', 'admin1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.apiAccessToken.update).not.toHaveBeenCalled();
    });

    it('is idempotent — revoking an already-revoked token does not throw', async () => {
      mockPrisma.apiAccessToken.findUnique.mockResolvedValue({ id: 'tok1', isRevoked: true });
      mockPrisma.apiAccessToken.update.mockResolvedValue({ id: 'tok1', isRevoked: true });

      await expect(service.revokeToken('tok1', 'admin1')).resolves.toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-tokens.service.spec.ts
```

Expected: FAIL — `service.listTokens is not a function`.

- [ ] **Step 3: Implement `listTokens` and `revokeToken`**

Add these methods to `apps/backend/src/modules/api-access/api-access.service.ts`, after `getManualUrl()`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest api-access-tokens.service.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Add the controller endpoints**

Add these methods to `apps/backend/src/modules/api-access/api-access.controller.ts`, at the end of the `ApiAccessController` class:

```typescript
  @Get('/tokens/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  listTokens() {
    return this.apiAccess.listTokens();
  }

  @Patch('/tokens/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  revokeToken(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.apiAccess.revokeToken(id, user.sub);
  }
```

Note: these are nested under the same `@Controller('api-access-requests')` base path (so the actual routes are `GET /api-access-requests/tokens/all` and `PATCH /api-access-requests/tokens/:id/revoke`) rather than a second `@Controller('api-access-tokens')` class — this avoids a second controller/module wiring for two small endpoints that share every dependency with `ApiAccessController` already. No route-ordering changes are needed: `GET :id` matches exactly one path segment, while `GET tokens/all` has two segments and `PATCH tokens/:id/revoke` has three — none of these share both the same HTTP method and the same segment count as an existing route (the only same-method/same-segment-count pair in this controller is `GET catalog` vs `GET :id`, both one segment, and `catalog` is already declared first in Task 3, resolving correctly), so appending `listTokens()`/`revokeToken()` at the end of the class exactly as shown below is safe as-is.

- [ ] **Step 6: Type-check and run the full backend suite**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. All `api-access` tests pass; only the same 2 pre-existing unrelated failures remain.

- [ ] **Step 7: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/backend/src/modules/api-access
git commit -m "feat: add Open API access token listing and revocation"
```

---

### Task 6: Frontend — shared entity/column checkbox-tree component

**Files:**
- Create: `apps/frontend/src/components/api-access/EntityColumnPicker.tsx`

**Interfaces:**
- Consumes: `GET /api-access-requests/catalog` (Task 3) — response shape `Record<string, string[]>`.
- Produces: React component `EntityColumnPicker` with props `{ value: Record<string, string[]>; onChange: (scope: Record<string, string[]>) => void }` — consumed by Task 7 (public form) and Task 8 (admin detail page).

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/api-access/EntityColumnPicker.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Checkbox, Spin } from 'antd';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface EntityColumnPickerProps {
  value: Record<string, string[]>;
  onChange: (scope: Record<string, string[]>) => void;
}

const ENTITY_LABEL: Record<string, string> = {
  Patient: 'ผู้ป่วย',
  Diagnosis: 'การวินิจฉัย',
  Prescription: 'ใบสั่งยา',
  CarePlanItem: 'แผนการดูแล',
  Activity: 'กิจกรรม/ไทม์ไลน์',
  DoctorSchedule: 'ตารางแพทย์',
  CareGiver: 'รายชื่อ Care Giver',
};

export default function EntityColumnPicker({ value, onChange }: EntityColumnPickerProps) {
  const [catalog, setCatalog] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api-access-requests/catalog`)
      .then((res) => res.json())
      .then(setCatalog)
      .catch(() => setCatalog({}));
  }, []);

  if (!catalog) return <Spin size="small" />;

  function toggleEntity(entity: string, columns: string[], checked: boolean) {
    const next = { ...value };
    if (checked) {
      next[entity] = columns;
    } else {
      delete next[entity];
    }
    onChange(next);
  }

  function toggleColumn(entity: string, column: string, checked: boolean) {
    const current = value[entity] ?? [];
    const next = { ...value };
    if (checked) {
      next[entity] = [...current, column];
    } else {
      const remaining = current.filter((c) => c !== column);
      if (remaining.length === 0) delete next[entity];
      else next[entity] = remaining;
    }
    onChange(next);
  }

  return (
    <div>
      {Object.entries(catalog).map(([entity, columns]) => {
        const selected = value[entity] ?? [];
        const allChecked = selected.length === columns.length;
        return (
          <div key={entity} style={{ marginBottom: 12 }}>
            <Checkbox
              checked={allChecked}
              indeterminate={selected.length > 0 && !allChecked}
              onChange={(e) => toggleEntity(entity, columns, e.target.checked)}
            >
              <strong>{ENTITY_LABEL[entity] ?? entity}</strong>
            </Checkbox>
            <div style={{ marginLeft: 24, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {columns.map((column) => (
                <Checkbox
                  key={column}
                  checked={selected.includes(column)}
                  onChange={(e) => toggleColumn(entity, column, e.target.checked)}
                >
                  {column}
                </Checkbox>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/frontend/src/components/api-access/EntityColumnPicker.tsx
git commit -m "feat: add shared entity/column picker component for Open API access"
```

---

### Task 7: Frontend — public request page

**Files:**
- Create: `apps/frontend/src/app/(public)/api-access/request/page.tsx`
- Modify: `apps/frontend/src/middleware.ts` (whitelist the new public route)

**Interfaces:**
- Consumes: `EntityColumnPicker` (Task 6), `POST /api-access-requests` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Whitelist the new route in the auth middleware**

Open `apps/frontend/src/middleware.ts`. Find this block:

```typescript
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  ) {
    return NextResponse.next();
  }
```

Replace with:

```typescript
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api-access')
  ) {
    return NextResponse.next();
  }
```

- [ ] **Step 2: Create the public request page**

Create `apps/frontend/src/app/(public)/api-access/request/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Button, Card, Form, Input, Radio, Result, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import EntityColumnPicker from '@/components/api-access/EntityColumnPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE = 10 * 1024 * 1024;

export default function ApiAccessRequestPage() {
  const [form] = Form.useForm();
  const [scope, setScope] = useState<Record<string, string[]>>({});
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(values: any) {
    if (Object.keys(scope).length === 0) {
      message.error('กรุณาเลือกข้อมูลที่ต้องการเข้าถึงอย่างน้อย 1 รายการ');
      return;
    }
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error('กรุณาแนบไฟล์ยื่นความประสงค์');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('requesterName', values.requesterName);
      if (values.requesterOrg) formData.append('requesterOrg', values.requesterOrg);
      formData.append('email', values.email);
      formData.append('phone', values.phone);
      formData.append('requestedLevel', values.requestedLevel);
      formData.append('requestedScope', JSON.stringify(scope));
      formData.append('justificationFile', file as File);

      const res = await fetch(`${API_URL}/api-access-requests`, { method: 'POST', body: formData });
      if (res.ok) {
        setSubmitted(true);
      } else {
        message.error('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch {
      message.error('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: 16 }}>
        <Result
          status="success"
          title="ส่งคำขอเรียบร้อยแล้ว"
          subTitle="เราจะแจ้งผลการพิจารณาไปทางอีเมลที่ท่านระบุ"
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: 16 }}>
      <Card title="ขอใช้งาน Open API">
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="requesterName" label="ชื่อผู้ขอ" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="requesterOrg" label="หน่วยงาน (ถ้ามี)">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="เบอร์โทร" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="ไฟล์ยื่นความประสงค์ (PDF, DOC, DOCX)"
            required
          >
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                if (!ALLOWED_MIME.includes(file.type)) {
                  message.error('รองรับเฉพาะไฟล์ PDF, DOC, DOCX');
                  return Upload.LIST_IGNORE;
                }
                if (file.size > MAX_SIZE) {
                  message.error('ไฟล์ต้องมีขนาดไม่เกิน 10MB');
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>เลือกไฟล์</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="requestedLevel" label="ระดับการใช้งาน" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: 'View (ดูข้อมูลอย่างเดียว)', value: 'VIEW' },
                { label: 'Create + Update (เพิ่ม/แก้ไขข้อมูล)', value: 'CREATE_UPDATE' },
              ]}
            />
          </Form.Item>
          <Form.Item label="ข้อมูลที่ต้องการเข้าถึง" required>
            <EntityColumnPicker value={scope} onChange={setScope} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            ส่งคำขอ
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add apps/frontend/src/app/\(public\)/api-access/request/page.tsx apps/frontend/src/middleware.ts
git commit -m "feat: add public Open API access request page"
```

---

### Task 8: Frontend — SuperAdmin requests list + review detail page

**Files:**
- Create: `apps/frontend/src/app/(admin)/admin/api-access-requests/page.tsx`
- Create: `apps/frontend/src/app/(admin)/admin/api-access-requests/[id]/page.tsx`

**Interfaces:**
- Consumes: `EntityColumnPicker` (Task 6), `GET /api-access-requests` / `GET /api-access-requests/:id` / `PATCH /api-access-requests/:id/approve` / `PATCH /api-access-requests/:id/reject` (Task 4).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Create the list page**

Create `apps/frontend/src/app/(admin)/admin/api-access-requests/page.tsx`:

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Radio, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ApiAccessRequestRow {
  id: string;
  requesterName: string;
  requesterOrg?: string | null;
  email: string;
  requestedLevel: 'VIEW' | 'CREATE_UPDATE';
  status: RequestStatus;
  createdAt: string;
}

const STATUS_COLOR: Record<RequestStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<RequestStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function AdminApiAccessRequestsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const router = useRouter();
  const [requests, setRequests] = useState<ApiAccessRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequestStatus>('PENDING');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const res = await fetch(`${API_URL}/api-access-requests${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRequests(await res.json());
      else message.error('โหลดรายการคำขอไม่สำเร็จ');
    } catch {
      message.error('โหลดรายการคำขอไม่สำเร็จ');
    }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: 'ผู้ขอ', dataIndex: 'requesterName' },
    { title: 'หน่วยงาน', dataIndex: 'requesterOrg', render: (v?: string) => v ?? '-' },
    { title: 'อีเมล', dataIndex: 'email' },
    { title: 'ระดับ', dataIndex: 'requestedLevel', render: (v: string) => (v === 'VIEW' ? 'View' : 'Create + Update') },
    { title: 'วันที่ขอ', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'สถานะ', dataIndex: 'status', render: (v: RequestStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอใช้งาน Open API</h1>
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
      <Table
        dataSource={requests}
        rowKey="id"
        size="small"
        columns={columns}
        onRow={(record) => ({ onClick: () => router.push(`/admin/api-access-requests/${record.id}`) })}
        rowClassName={() => 'clickable-row'}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the detail/review page**

Create `apps/frontend/src/app/(admin)/admin/api-access-requests/[id]/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Input, Radio, Space, Typography, message } from 'antd';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import EntityColumnPicker from '@/components/api-access/EntityColumnPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiAccessRequestDetail {
  id: string;
  requesterName: string;
  requesterOrg?: string | null;
  email: string;
  phone: string;
  justificationFileUrl: string;
  requestedLevel: 'VIEW' | 'CREATE_UPDATE';
  requestedScope: Record<string, string[]>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function ApiAccessRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const router = useRouter();

  const [request, setRequest] = useState<ApiAccessRequestDetail | null>(null);
  const [level, setLevel] = useState<'VIEW' | 'CREATE_UPDATE'>('VIEW');
  const [scope, setScope] = useState<Record<string, string[]>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api-access-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data: ApiAccessRequestDetail) => {
        setRequest(data);
        setLevel(data.requestedLevel);
        setScope(data.requestedScope);
      });
  }, [token, id]);

  async function handleApprove() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api-access-requests/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantedLevel: level, grantedScope: scope }),
      });
      if (res.ok) {
        const data = await res.json();
        setIssuedToken(data.plaintextToken);
        message.success('อนุมัติคำขอแล้ว ระบบได้ส่งอีเมลแจ้งผู้ขอแล้ว');
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api-access-requests/${id}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (res.ok) {
        message.success('ปฏิเสธคำขอแล้ว');
        router.push('/admin/api-access-requests');
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!request) return null;

  if (issuedToken) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Card title="อนุมัติสำเร็จ">
          <Typography.Paragraph type="warning">
            กรุณาคัดลอก Token นี้เก็บไว้ ระบบจะไม่แสดง Token นี้ซ้ำอีก (ระบบได้ส่งอีเมลนี้ให้ผู้ขอแล้วโดยอัตโนมัติ)
          </Typography.Paragraph>
          <Input.TextArea value={issuedToken} readOnly autoSize rows={2} />
          <Button style={{ marginTop: 16 }} onClick={() => router.push('/admin/api-access-requests')}>
            กลับไปหน้ารายการ
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Card title="พิจารณาคำขอใช้งาน Open API">
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="ผู้ขอ">{request.requesterName}</Descriptions.Item>
          <Descriptions.Item label="หน่วยงาน">{request.requesterOrg ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="อีเมล">{request.email}</Descriptions.Item>
          <Descriptions.Item label="เบอร์โทร">{request.phone}</Descriptions.Item>
          <Descriptions.Item label="ไฟล์ยื่นความประสงค์">
            <a href={`${API_URL}${request.justificationFileUrl}`} target="_blank" rel="noreferrer">เปิดไฟล์</a>
          </Descriptions.Item>
        </Descriptions>

        {request.status !== 'PENDING' ? (
          <Typography.Text>คำขอนี้ถูกพิจารณาไปแล้ว</Typography.Text>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>ระดับการใช้งาน</Typography.Text>
              <Radio.Group
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                options={[
                  { label: 'View', value: 'VIEW' },
                  { label: 'Create + Update', value: 'CREATE_UPDATE' },
                ]}
                style={{ display: 'block', marginTop: 8 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>ข้อมูลที่อนุญาตให้เข้าถึง</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <EntityColumnPicker value={scope} onChange={setScope} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>เหตุผล (กรณีปฏิเสธ, ไม่บังคับ)</Typography.Text>
              <Input.TextArea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{ marginTop: 8 }}
              />
            </div>
            <Space>
              <Button type="primary" loading={saving} onClick={handleApprove}>อนุมัติ</Button>
              <Button danger loading={saving} onClick={handleReject}>ปฏิเสธ</Button>
            </Space>
          </>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add "apps/frontend/src/app/(admin)/admin/api-access-requests"
git commit -m "feat: add SuperAdmin Open API access request review pages"
```

---

### Task 9: Frontend — SuperAdmin tokens list page

**Files:**
- Create: `apps/frontend/src/app/(admin)/admin/api-access-tokens/page.tsx`

**Interfaces:**
- Consumes: `GET /api-access-requests/tokens/all` / `PATCH /api-access-requests/tokens/:id/revoke` (Task 5).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Create the tokens list page**

Create `apps/frontend/src/app/(admin)/admin/api-access-tokens/page.tsx`:

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Button, Modal, Table, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiAccessTokenRow {
  id: string;
  grantedLevel: 'VIEW' | 'CREATE_UPDATE';
  grantedScope: Record<string, string[]>;
  isRevoked: boolean;
  createdAt: string;
  request: { requesterName: string; requesterOrg?: string | null; email: string };
}

export default function AdminApiAccessTokensPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [tokens, setTokens] = useState<ApiAccessTokenRow[]>([]);
  const [modal, contextHolder] = Modal.useModal();

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api-access-requests/tokens/all`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setTokens(await res.json());
      else message.error('โหลดรายการ Token ไม่สำเร็จ');
    } catch {
      message.error('โหลดรายการ Token ไม่สำเร็จ');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleRevoke(id: string) {
    const res = await fetch(`${API_URL}/api-access-requests/tokens/${id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      message.success('เพิกถอน Token แล้ว');
      load();
    } else {
      message.error('เกิดข้อผิดพลาด');
    }
  }

  const columns = [
    { title: 'ผู้ขอ', render: (_: any, r: ApiAccessTokenRow) => r.request.requesterName },
    { title: 'หน่วยงาน', render: (_: any, r: ApiAccessTokenRow) => r.request.requesterOrg ?? '-' },
    { title: 'อีเมล', render: (_: any, r: ApiAccessTokenRow) => r.request.email },
    { title: 'ระดับ', dataIndex: 'grantedLevel', render: (v: string) => (v === 'VIEW' ? 'View' : 'Create + Update') },
    { title: 'ข้อมูลที่เข้าถึงได้', dataIndex: 'grantedScope', render: (v: Record<string, string[]>) => Object.keys(v).join(', ') },
    { title: 'ออกให้เมื่อ', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'สถานะ',
      dataIndex: 'isRevoked',
      render: (v: boolean) => (v ? <Tag color="red">เพิกถอนแล้ว</Tag> : <Tag color="green">ใช้งานได้</Tag>),
    },
    {
      title: '',
      render: (_: any, r: ApiAccessTokenRow) =>
        !r.isRevoked && (
          <Button
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: 'ยืนยันการเพิกถอน Token',
                content: `Token ของ ${r.request.requesterName} จะไม่สามารถใช้งานได้อีก`,
                okText: 'เพิกถอน',
                okButtonProps: { danger: true },
                onOk: () => handleRevoke(r.id),
              })
            }
          >
            เพิกถอน
          </Button>
        ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>Token การใช้งาน Open API</h1>
      <Table dataSource={tokens} rowKey="id" size="small" columns={columns} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
git add "apps/frontend/src/app/(admin)/admin/api-access-tokens"
git commit -m "feat: add SuperAdmin Open API access token management page"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild containers**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl frontend_hl
```

Expected: both containers report `Built`/`Started`, no errors. Check backend logs for the automatic `prisma migrate deploy` picking up the new migration:

```bash
docker compose logs backend_hl --tail 30
```

Expected: no migration errors, server starts and logs `🚀 HomeMed Connect API running on port 8085` (or the configured port).

- [ ] **Step 2: Verify the public submission endpoint end-to-end via curl**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
echo "%PDF-1.4 test" > /tmp/test-justification.pdf

curl -s -X GET http://localhost:8085/api-access-requests/catalog | python3 -m json.tool | head -20

RESPONSE=$(curl -s -X POST http://localhost:8085/api-access-requests \
  -F "requesterName=ทดสอบ ระบบ" \
  -F "email=test@example.com" \
  -F "phone=0812345678" \
  -F "requestedLevel=VIEW" \
  -F 'requestedScope={"Patient":["hn","age"]}' \
  -F "justificationFile=@/tmp/test-justification.pdf;type=application/pdf")
echo "$RESPONSE"
rm -f /tmp/test-justification.pdf
```

Expected: the catalog GET prints the 7-entity JSON object; the POST response is `{"id":"<uuid>","status":"PENDING"}`.

- [ ] **Step 3: Verify rate limiting**

```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" -X POST http://localhost:8085/api-access-requests \
    -F "requesterName=Test$i" -F "email=t$i@example.com" -F "phone=0800000000" \
    -F "requestedLevel=VIEW" -F 'requestedScope={"Patient":["hn"]}'
done
```

Expected: attempts 1-3 return `400` (missing file — that's fine, we're testing the rate limiter, not the full flow) and attempt 4 returns `429 Too Many Requests`.

- [ ] **Step 4: Verify the SuperAdmin approve flow end-to-end via curl**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
TOKEN=$(curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('accessToken',''))")
echo "Note: cm1 is CASE_MANAGER, not SUPER_ADMIN — confirm this returns 403 first:"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8085/api-access-requests -H "Authorization: Bearer $TOKEN"

SUPERADMIN_TOKEN=$(curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin@hospital.th","password":"SuperAdmin1!"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('accessToken',''))")
curl -s http://localhost:8085/api-access-requests?status=PENDING -H "Authorization: Bearer $SUPERADMIN_TOKEN" | python3 -m json.tool
```

Expected: the CASE_MANAGER request returns `403`; the SUPER_ADMIN request lists the PENDING request created in Step 2. Adjust the SuperAdmin credentials if `superadmin@hospital.th` isn't the actual seeded account — check `apps/backend/prisma/seed.ts` for the real seeded SUPER_ADMIN email/password if this login fails.

Take the request `id` from that list and approve it:

```bash
REQUEST_ID="<paste id from previous output>"
curl -s -X PATCH "http://localhost:8085/api-access-requests/$REQUEST_ID/approve" \
  -H "Authorization: Bearer $SUPERADMIN_TOKEN" -H "Content-Type: application/json" -d '{}' | python3 -m json.tool
```

Expected: response includes `plaintextToken` (a 64-character hex string) and `request.status: "APPROVED"`. Check backend logs for the (expectedly failing, since no real SMTP creds) mail attempt:

```bash
docker compose logs backend_hl --tail 10 | grep -i mail
```

Expected: a logged error like "Failed to send email to test@example.com: ..." — this confirms the send path was reached and failed gracefully (not silently skipped, not crashing the request) exactly as designed, since no real SMTP credentials exist yet.

- [ ] **Step 5: Verify revocation**

```bash
TOKENS=$(curl -s http://localhost:8085/api-access-requests/tokens/all -H "Authorization: Bearer $SUPERADMIN_TOKEN")
echo "$TOKENS" | python3 -m json.tool
TOKEN_ID=$(echo "$TOKENS" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

curl -s -X PATCH "http://localhost:8085/api-access-requests/tokens/$TOKEN_ID/revoke" \
  -H "Authorization: Bearer $SUPERADMIN_TOKEN" -w "\n%{http_code}\n"
```

Expected: `200`, and re-fetching `tokens/all` shows `isRevoked: true` for that token.

- [ ] **Step 6: Browser check — public request page**

Navigate to `http://localhost:8080/api-access/request` **without being logged in** (use an incognito/private window, or confirm the current session is logged out) and confirm the page loads directly (not redirected to `/login`), the entity/column checkboxes render (fetched from the catalog endpoint), and submitting a complete form (with a small PDF) shows the "ส่งคำขอเรียบร้อยแล้ว" success screen.

- [ ] **Step 7: Browser check — SuperAdmin review flow**

Log in as the seeded SUPER_ADMIN account, navigate to `/admin/api-access-requests`, confirm the request from Step 6 appears as PENDING, click into its detail page, confirm the justification file link opens, adjust the granted columns (uncheck one), click "อนุมัติ", and confirm the one-time token box appears. Then navigate to `/admin/api-access-tokens` and confirm the new token appears with "ใช้งานได้" status; click "เพิกถอน" and confirm it flips to "เพิกถอนแล้ว".

- [ ] **Step 8: Report results**

No commit for this task — it's a verification checkpoint. If any step fails, go back to the relevant task and fix before considering this plan done.

---

## Self-Review Notes

- **Spec coverage:** public request page with file upload, email, phone, level, and column checklist ✓ (Task 7 + Task 3); SuperAdmin approval queue with scope-editing before approve ✓ (Task 8 + Task 4); reject with optional reason + email ✓ (Task 4 + Task 8); opaque hashed token generation ✓ (Task 4); automatic approval email with token + Swagger link + manual link ✓ (Task 2 + Task 4); token revocation, instant, no scheduled expiry ✓ (Task 5 + Task 9); rate limiting on the public endpoint ✓ (Task 3); entity/column catalog as single source of truth for both screens ✓ (Task 1 + Task 6); manual PDF upload (single static file) ✓ (Task 4).
- **Placeholder scan:** none found — every step has complete, runnable code or an exact command. The one deliberately-deferred piece (real SMTP credentials, real Swagger hosting) is explicitly called out as a placeholder in the Global Constraints and spec, not hidden inside a task step.
- **Type consistency:** `ApiAccessService.approve()`'s return shape `{ request, plaintextToken }` is used identically by its only two consumers — the Task 4 test and the Task 8 frontend detail page (`data.plaintextToken`). `EntityColumnPicker`'s props (`value: Record<string, string[]>`, `onChange: (scope: Record<string, string[]>) => void`) are used identically by both its consumers (Task 7's public page passes `scope`/`setScope`; Task 8's detail page passes `scope`/`setScope` seeded from `requestedScope`). The catalog shape `Record<string, string[]>` returned by `GET /api-access-requests/catalog` (Task 3) matches exactly what `EntityColumnPicker` (Task 6) expects to receive from that same endpoint.
