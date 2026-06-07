# Backend Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all P0/P1 backend security and functionality gaps identified in the gap analysis.

**Architecture:** Fix the Prisma M2M conflict first (blocking for migrations), then harden auth (HttpOnly cookie, rate limits), wire up the already-installed Bull queue for async Line notifications, add the missing `POST /tasks/:id/submit` URL alias, and enforce check-in rate limiting via Redis.

**Tech Stack:** NestJS 10, Prisma 6, `@nestjs/bull` + `bull` (already installed), `@nestjs/throttler` (already installed), `@nestjs/platform-express` `cookie-parser`, Redis (ioredis already wired)

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/backend/prisma/schema.prisma` |
| Create | `apps/backend/prisma/migrations/…` (via CLI) |
| Modify | `apps/backend/src/modules/auth/auth.controller.ts` |
| Modify | `apps/backend/src/modules/auth/auth.service.ts` |
| Modify | `apps/backend/src/app.module.ts` |
| Modify | `apps/backend/src/main.ts` |
| Create | `apps/backend/src/modules/notifications/notifications.module.ts` |
| Create | `apps/backend/src/modules/notifications/notifications.processor.ts` |
| Create | `apps/backend/src/modules/notifications/notifications.service.ts` |
| Modify | `apps/backend/src/modules/line/line.module.ts` |
| Modify | `apps/backend/src/modules/line/line.controller.ts` |
| Modify | `apps/backend/src/modules/tasks/tasks.controller.ts` |
| Modify | `apps/backend/src/modules/tasks/tasks.service.ts` |
| Create | `apps/backend/src/modules/tasks/dto/submit-task.dto.ts` |
| Create | `apps/backend/src/modules/tasks/test/tasks.service.spec.ts` |
| Create | `apps/backend/src/modules/auth/test/auth.controller.spec.ts` |

---

### Task 1: Fix Prisma Schema — Remove EventPatient Conflict

The `Event` model has `patients Patient[] @relation("EventPatients")` but `Patient.events` has no matching relation name, causing a Prisma schema error. Additionally, an explicit `EventPatient` model with `@@map("_EventPatients")` conflicts with the implicit M2M. Since `EventTask` already captures the event↔patient relationship, remove the redundant M2M.

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Remove the redundant M2M fields and EventPatient model**

Open `apps/backend/prisma/schema.prisma`. Make these three changes:

In `model Event`, remove the line:
```
  patients   Patient[]   @relation("EventPatients")
```

In `model Patient`, remove the line:
```
  events      Event[]
```

Delete the entire `EventPatient` model block:
```prisma
model EventPatient {
  eventId   String
  patientId String

  @@id([eventId, patientId])
  @@map("_EventPatients")
}
```

The Event→Patient relationship is fully captured via `Event.tasks → EventTask → patient`. No data is lost.

- [ ] **Step 2: Validate the schema**

```bash
cd apps/backend && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 3: Create and apply the migration**

```bash
cd apps/backend && npx prisma migrate dev --name remove-event-patient-m2m
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify generated client**

```bash
cd apps/backend && npx prisma generate
```

Expected: no errors, `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/
git commit -m "fix: remove redundant EventPatient M2M — EventTask captures this relationship"
```

---

### Task 2: Auth — Refresh Token as HttpOnly Cookie

Currently `POST /auth/login` returns `{ accessToken, refreshToken, role }` in the JSON body. The spec requires the refresh token to be stored in an HttpOnly Secure cookie so it's inaccessible to JavaScript.

**Files:**
- Modify: `apps/backend/src/main.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Create: `apps/backend/src/modules/auth/test/auth.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/auth/test/auth.controller.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth.controller.spec.ts --no-coverage
```

Expected: FAIL — `login sets HttpOnly cookie` fails because controller returns full object.

- [ ] **Step 3: Enable cookie-parser in main.ts**

Open `apps/backend/src/main.ts`. Add after the imports:

```typescript
import * as cookieParser from 'cookie-parser';
```

Add after `app.use(helmet())`:

```typescript
app.use(cookieParser());
```

- [ ] **Step 4: Update auth.controller.ts**

Replace the full contents of `apps/backend/src/modules/auth/auth.controller.ts`:

```typescript
import {
  Controller, Post, Body, Res, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, role } = await this.auth.login(dto.email, dto.password);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string = req.cookies?.[COOKIE_NAME] ?? '';
    const { accessToken, refreshToken, role } = await this.auth.refresh(token);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) res: Response, @Body('refreshToken') bodyToken?: string) {
    const token: string = bodyToken ?? '';
    await this.auth.logout(token);
    res.clearCookie(COOKIE_NAME);
  }

  @Post('liff/verify')
  @HttpCode(HttpStatus.OK)
  liffVerify(@Body('idToken') idToken: string) {
    return this.auth.verifyLiffToken(idToken);
  }
}
```

- [ ] **Step 5: Install cookie-parser types**

```bash
cd apps/backend && npm install --save-dev @types/cookie-parser && npm install cookie-parser
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth.controller.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/main.ts apps/backend/src/modules/auth/ apps/backend/package.json apps/backend/package-lock.json
git commit -m "feat: refresh token as HttpOnly cookie (OWASP A07)"
```

---

### Task 3: Login Rate Limit — 5 Attempts per 15 Minutes

The global `ThrottlerModule` is 60/min. The spec requires login specifically to be limited to 5 attempts per 15 minutes.

**Files:**
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/auth/test/auth.controller.spec.ts` (inside the `describe` block):

```typescript
it('login endpoint has Throttle metadata set to 5/900', () => {
  const { Reflector } = require('@nestjs/core');
  const reflector = new Reflector();
  // ThrottlerGuard reads THROTTLER_OPTIONS metadata
  const metadata = Reflect.getMetadata('THROTTLER:OPTIONS', controller.login);
  // If metadata is set, it should constrain to 5 in 900s
  // We verify the handler has custom throttle options
  expect(metadata).toBeDefined();
  expect(metadata[0]).toMatchObject({ limit: 5, ttl: 900000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth.controller.spec.ts --no-coverage
```

Expected: FAIL — metadata is undefined on login handler.

- [ ] **Step 3: Update ThrottlerModule to support named throttlers**

Open `apps/backend/src/app.module.ts`. Replace `ThrottlerModule.forRoot` with:

```typescript
ThrottlerModule.forRoot([
  { name: 'global', ttl: 60000, limit: 60 },
  { name: 'login', ttl: 900000, limit: 5 },
]),
```

- [ ] **Step 4: Add `@Throttle` decorator to login in auth.controller.ts**

Add the import at the top of auth.controller.ts:

```typescript
import { Throttle } from '@nestjs/throttler';
```

Add the decorator to the `login` method:

```typescript
@Post('login')
@HttpCode(HttpStatus.OK)
@Throttle({ login: { ttl: 900000, limit: 5 } })
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth.controller.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/app.module.ts apps/backend/src/modules/auth/auth.controller.ts
git commit -m "feat: login rate limit 5/15min (OWASP A07)"
```

---

### Task 4: Notifications Module — Async Bull Queue for Line Pushes

`@nestjs/bull` and `bull` are already in `package.json`. The `LineService.pushTaskNotification` is currently called synchronously. Move it behind a queue so the HTTP response isn't blocked by the Line API call.

**Files:**
- Create: `apps/backend/src/modules/notifications/notifications.module.ts`
- Create: `apps/backend/src/modules/notifications/notifications.service.ts`
- Create: `apps/backend/src/modules/notifications/notifications.processor.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/modules/line/line.module.ts`
- Modify: `apps/backend/src/modules/line/line.controller.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/notifications/test/notifications.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

const mockQueue: Partial<Queue> = {
  add: jest.fn().mockResolvedValue({ id: '1' }),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  it('enqueueTaskNotification calls queue.add with correct job data', async () => {
    const payload = {
      lineUserId: 'U123',
      taskId: 't1',
      title: 'Task 1',
      patientName: 'John',
      token: 'tok',
    };
    await service.enqueueTaskNotification(payload);
    expect(mockQueue.add).toHaveBeenCalledWith('send-task-notification', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/notifications/test --no-coverage
```

Expected: FAIL — `NotificationsService` not found.

- [ ] **Step 3: Create notifications.service.ts**

Create `apps/backend/src/modules/notifications/notifications.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface TaskNotificationPayload {
  lineUserId: string;
  taskId: string;
  title: string;
  patientName: string;
  token: string;
  dueAt?: string;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('notifications') private queue: Queue) {}

  async enqueueTaskNotification(payload: TaskNotificationPayload) {
    await this.queue.add('send-task-notification', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }
}
```

- [ ] **Step 4: Create notifications.processor.ts**

Create `apps/backend/src/modules/notifications/notifications.processor.ts`:

```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { LineService } from '../line/line.service';
import { TaskNotificationPayload } from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private line: LineService) {}

  @Process('send-task-notification')
  async handleTaskNotification(job: Job<TaskNotificationPayload>) {
    const { lineUserId, taskId, title, patientName, token, dueAt } = job.data;
    this.logger.log(`Sending Line notification for task ${taskId}`);
    await this.line.pushTaskNotification(lineUserId, {
      id: taskId,
      title,
      patientName,
      token,
      dueAt: dueAt ? new Date(dueAt) : undefined,
    });
  }
}
```

- [ ] **Step 5: Create notifications.module.ts**

Create `apps/backend/src/modules/notifications/notifications.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { LineModule } from '../line/line.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    LineModule,
  ],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 6: Register BullModule in app.module.ts**

Open `apps/backend/src/app.module.ts`. Add the imports at the top:

```typescript
import { BullModule } from '@nestjs/bull';
import { NotificationsModule } from './modules/notifications/notifications.module';
```

Add to the `imports` array, after `RedisModule.forRootAsync`:

```typescript
BullModule.forRootAsync({
  useFactory: () => ({
    redis: process.env.REDIS_URL ?? 'redis://localhost:6379',
  }),
}),
```

Add `NotificationsModule` to the imports array.

- [ ] **Step 7: Update LineModule to export LineService**

Open `apps/backend/src/modules/line/line.module.ts`. Ensure `LineService` is exported:

```typescript
import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [LineController],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
```

- [ ] **Step 8: Update LineController to use NotificationsService**

Open `apps/backend/src/modules/line/line.controller.ts`. Replace the `notify` method to use the queue:

Add import at top:

```typescript
import { NotificationsService } from '../notifications/notifications.service';
```

Update constructor and `notify` method:

```typescript
constructor(
  private line: LineService,
  private tasks: TasksService,
  private notifications: NotificationsService,
) {}

@Post('notify/:taskId')
@UseGuards(JwtAuthGuard)
async notify(@Param('taskId') taskId: string, @CurrentUser() _user: JwtPayload) {
  const task = await this.tasks.findOne(taskId);
  const token = await this.tasks.generateLiffToken(taskId);
  if (task.assignee?.lineUserId) {
    await this.notifications.enqueueTaskNotification({
      lineUserId: task.assignee.lineUserId,
      taskId: task.id,
      title: (task.event as any)?.title ?? 'งานใหม่',
      patientName: 'ผู้ป่วย',
      token,
    });
  }
  return { queued: !!task.assignee?.lineUserId, token };
}
```

Update `LineModule` to import `NotificationsModule`:

```typescript
import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TasksModule, NotificationsModule],
  controllers: [LineController],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/modules/notifications/test --no-coverage
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/notifications/ apps/backend/src/modules/line/ apps/backend/src/app.module.ts
git commit -m "feat: async Line notifications via Bull queue (A09 audit trail)"
```

---

### Task 5: Add POST /tasks/:id/submit Endpoint

The spec defines `POST /tasks/:id/submit` but the current implementation uses `POST /submissions` with `taskId` in the body. Add the spec-aligned endpoint.

**Files:**
- Modify: `apps/backend/src/modules/tasks/tasks.controller.ts`
- Modify: `apps/backend/src/modules/tasks/tasks.module.ts`
- Create: `apps/backend/src/modules/tasks/dto/submit-task.dto.ts`
- Create: `apps/backend/src/modules/tasks/test/tasks.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/tasks/test/tasks.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TasksController } from '../tasks.controller';
import { TasksService } from '../tasks.service';
import { SubmissionsService } from '../../submissions/submissions.service';

const mockTasksService = {
  findMyTasks: jest.fn(),
  checkin: jest.fn(),
  addNote: jest.fn(),
  updateStatus: jest.fn(),
  generateLiffToken: jest.fn(),
  consumeLiffToken: jest.fn(),
};
const mockSubmissionsService = {
  create: jest.fn().mockResolvedValue({ id: 'sub1' }),
};
const mockUser = { sub: 'u1', email: 'a@b.com', role: 'FIELD_WORKER', orgId: 'o1' };

describe('TasksController POST /:id/submit', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: SubmissionsService, useValue: mockSubmissionsService },
      ],
    }).compile();
    controller = module.get(TasksController);
    jest.clearAllMocks();
  });

  it('submit delegates to SubmissionsService.create', async () => {
    const dto = { token: 'tok', answers: [{ fieldId: 'f1', value: 'yes' }] };
    const result = await controller.submit('task1', dto, mockUser as any);
    expect(mockSubmissionsService.create).toHaveBeenCalledWith('u1', {
      taskId: 'task1',
      token: 'tok',
      answers: dto.answers,
    });
    expect(result).toEqual({ id: 'sub1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/tasks/test/tasks.controller.spec.ts --no-coverage
```

Expected: FAIL — `submit` method not found on controller.

- [ ] **Step 3: Create submit-task.dto.ts**

Create `apps/backend/src/modules/tasks/dto/submit-task.dto.ts`:

```typescript
import { IsString, IsArray, IsNotEmpty } from 'class-validator';

export class SubmitTaskDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsArray()
  answers: { fieldId: string; value: unknown }[];
}
```

- [ ] **Step 4: Update tasks.controller.ts**

Open `apps/backend/src/modules/tasks/tasks.controller.ts`. Add the submit endpoint:

Add imports:

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SubmissionsService } from '../submissions/submissions.service';
import { SubmitTaskDto } from './dto/submit-task.dto';
```

Update constructor:

```typescript
constructor(
  private tasks: TasksService,
  private submissions: SubmissionsService,
) {}
```

Add method after `status`:

```typescript
@Post(':id/submit')
@HttpCode(HttpStatus.CREATED)
submit(
  @Param('id') id: string,
  @Body() dto: SubmitTaskDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.submissions.create(user.sub, { taskId: id, token: dto.token, answers: dto.answers });
}
```

- [ ] **Step 5: Update tasks.module.ts to include SubmissionsModule**

Open `apps/backend/src/modules/tasks/tasks.module.ts`. Add:

```typescript
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { SubmissionsModule } from '../submissions/submissions.module';

@Module({
  imports: [SubmissionsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

Ensure `SubmissionsModule` exports `SubmissionsService` — open `apps/backend/src/modules/submissions/submissions.module.ts` and add `exports: [SubmissionsService]`.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/modules/tasks/test --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/tasks/ apps/backend/src/modules/submissions/submissions.module.ts
git commit -m "feat: POST /tasks/:id/submit endpoint per spec API contract"
```

---

### Task 6: Check-in Rate Limit — 1 per Hour per Task-User Pair

The spec (OWASP A04) requires check-in to be limited to once per hour per user per task. Implement via Redis TTL key.

**Files:**
- Modify: `apps/backend/src/modules/tasks/tasks.service.ts`
- Modify: `apps/backend/src/modules/tasks/test/tasks.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/tasks/test/tasks.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { getRedisToken } from '@nestjs-modules/ioredis';
import { TooManyRequestsException } from '@nestjs/common';

const mockPrisma = {
  eventTask: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  activity: { create: jest.fn() },
};
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  getdel: jest.fn(),
  del: jest.fn(),
};
const mockConfig = { get: jest.fn() };

describe('TasksService checkin rate limit', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisToken(), useValue: mockRedis },
      ],
    }).compile();
    service = module.get(TasksService);
    jest.clearAllMocks();
  });

  it('checkin throws TooManyRequestsException when Redis key exists', async () => {
    mockPrisma.eventTask.findUnique.mockResolvedValue({ id: 't1', assigneeId: 'u1', event: {}, patient: {}, assignee: {} });
    mockRedis.get.mockResolvedValue('1'); // rate-limit key exists

    await expect(service.checkin('t1', 'u1')).rejects.toThrow(TooManyRequestsException);
  });

  it('checkin succeeds and sets Redis key when no rate-limit key', async () => {
    mockPrisma.eventTask.findUnique.mockResolvedValue({ id: 't1', assigneeId: 'u1', event: {}, patient: {}, assignee: {} });
    mockPrisma.eventTask.update.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });
    mockRedis.get.mockResolvedValue(null); // no key
    mockRedis.setex.mockResolvedValue('OK');

    const result = await service.checkin('t1', 'u1');
    expect(mockRedis.setex).toHaveBeenCalledWith('checkin:t1:u1', 3600, '1');
    expect(result).toMatchObject({ status: 'IN_PROGRESS' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/modules/tasks/test/tasks.service.spec.ts --no-coverage
```

Expected: FAIL — checkin does not check Redis for rate limit.

- [ ] **Step 3: Update checkin in tasks.service.ts**

Open `apps/backend/src/modules/tasks/tasks.service.ts`. Add `TooManyRequestsException` to imports:

```typescript
import { Injectable, NotFoundException, GoneException, TooManyRequestsException } from '@nestjs/common';
```

Replace the `checkin` method:

```typescript
async checkin(taskId: string, userId: string) {
  const task = await this.findOne(taskId);
  if (task.assigneeId !== userId) throw new NotFoundException('Task not found');

  const rateLimitKey = `checkin:${taskId}:${userId}`;
  const existing = await this.redis.get(rateLimitKey);
  if (existing) throw new TooManyRequestsException('Check-in already recorded in the last hour');

  await this.redis.setex(rateLimitKey, 3600, '1');
  return this.prisma.eventTask.update({
    where: { id: taskId },
    data: { status: 'IN_PROGRESS' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/modules/tasks/test/tasks.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Run all backend tests**

```bash
cd apps/backend && npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/tasks/
git commit -m "feat: check-in rate limit 1/hr per task-user pair (OWASP A04)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ EventPatient M2M conflict → Task 1
- ✅ Refresh token HttpOnly cookie → Task 2
- ✅ Login rate limit 5/15min → Task 3
- ✅ Async Line push via Bull queue → Task 4
- ✅ `POST /tasks/:id/submit` → Task 5
- ✅ Check-in rate limit 1/hr → Task 6

**Not in this plan (P1 from gap analysis):**
- PatientOwnerGuard — patients.service.ts already enforces org-scoping via `findFirst({ where: { id, organizationId: orgId } })`, which achieves the same effect. A dedicated guard is a refactor, not a correctness gap.
