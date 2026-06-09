# Role-Based Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement separate role-based dashboards and route groups for SUPER_ADMIN, CASE_MANAGER, FIELD_WORKER, and MEDICAL_VOLUNTEER with role-scoped data access.

**Architecture:** Next.js Route Groups (`(admin)`, `(cm)`, `(fw)`, `(medvol)`) each with their own `layout.tsx`; middleware redirects to the correct prefix after login. Backend adds a `Zone` model, `supervisorId` on `User`, `zoneId` on `Patient`, a `DashboardModule` with per-role stat endpoints, and scoped user/patient access.

**Tech Stack:** Next.js 15 App Router, NextAuth.js, NestJS, Prisma ORM, PostgreSQL, Ant Design, Tailwind CSS

---

## Phase 1 — Database

### Task 1: Prisma schema — Zone model + User.supervisorId + Patient.zoneId

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add Zone model and new fields to schema**

Open `apps/backend/prisma/schema.prisma` and add after the `Organization` model:

```prisma
model Zone {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  description    String?
  color          String?
  createdAt      DateTime     @default(now())
  patients       Patient[]
}
```

Add to `Organization` model relations block:
```prisma
  zones Zone[]
```

Patch `User` model — add after `avatarUrl`:
```prisma
  supervisorId   String?
  supervisor     User?   @relation("Supervisor", fields: [supervisorId], references: [id])
  subordinates   User[]  @relation("Supervisor")
```

Patch `Patient` model — add after `locationText`:
```prisma
  zoneId  String?
  zone    Zone?   @relation(fields: [zoneId], references: [id])
```

- [ ] **Step 2: Run migration**

```bash
cd apps/backend
npx prisma migrate dev --name add_zone_supervisor
```

Expected: migration created and applied, Prisma Client regenerated.

- [ ] **Step 3: Verify generated client has Zone type**

```bash
npx prisma studio
```

Open browser, confirm `Zone` table appears. Close Prisma Studio (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat(db): add Zone model, User.supervisorId, Patient.zoneId"
```

---

## Phase 2 — Backend API

### Task 2: Zones CRUD module

**Files:**
- Create: `apps/backend/src/modules/zones/zones.module.ts`
- Create: `apps/backend/src/modules/zones/zones.controller.ts`
- Create: `apps/backend/src/modules/zones/zones.service.ts`
- Create: `apps/backend/src/modules/zones/dto/create-zone.dto.ts`
- Create: `apps/backend/src/modules/zones/dto/update-zone.dto.ts`
- Create: `apps/backend/src/modules/zones/test/zones.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/zones/test/zones.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ZonesService } from '../zones.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  zone: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ZonesService', () => {
  let service: ZonesService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get(ZonesService);
    jest.clearAllMocks();
  });

  it('findAll returns zones for org', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1', name: 'สวนลุม', organizationId: 'org1' }]);
    const result = await service.findAll('org1');
    expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' }, include: { _count: { select: { patients: true } } } });
    expect(result).toHaveLength(1);
  });

  it('create makes a zone', async () => {
    mockPrisma.zone.create.mockResolvedValue({ id: 'z2', name: 'หัวลำโพง', organizationId: 'org1' });
    const result = await service.create('org1', { name: 'หัวลำโพง', description: null, color: '#7c3aed' });
    expect(result.name).toBe('หัวลำโพง');
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd apps/backend
npx jest zones.service.spec --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `ZonesService` not found.

- [ ] **Step 3: Create DTOs**

Create `apps/backend/src/modules/zones/dto/create-zone.dto.ts`:

```typescript
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateZoneDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  color?: string;
}
```

Create `apps/backend/src/modules/zones/dto/update-zone.dto.ts`:

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateZoneDto } from './create-zone.dto';
export class UpdateZoneDto extends PartialType(CreateZoneDto) {}
```

- [ ] **Step 4: Create ZonesService**

Create `apps/backend/src/modules/zones/zones.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class ZonesService {
  constructor(private prisma: PrismaService) {}

  findAll(orgId: string) {
    return this.prisma.zone.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { patients: true } } },
    });
  }

  async findOne(id: string, orgId: string) {
    const zone = await this.prisma.zone.findFirst({ where: { id, organizationId: orgId } });
    if (!zone) throw new NotFoundException('Zone not found');
    return zone;
  }

  create(orgId: string, dto: CreateZoneDto) {
    return this.prisma.zone.create({
      data: { organizationId: orgId, name: dto.name, description: dto.description, color: dto.color },
    });
  }

  async update(id: string, orgId: string, dto: UpdateZoneDto) {
    await this.findOne(id, orgId);
    return this.prisma.zone.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.zone.delete({ where: { id } });
  }
}
```

- [ ] **Step 5: Create ZonesController**

Create `apps/backend/src/modules/zones/zones.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Controller('zones')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZonesController {
  constructor(private zones: ZonesService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CASE_MANAGER)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.zones.findAll(user.orgId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateZoneDto, @CurrentUser() user: JwtPayload) {
    return this.zones.create(user.orgId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto, @CurrentUser() user: JwtPayload) {
    return this.zones.update(id, user.orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.zones.remove(id, user.orgId);
  }
}
```

- [ ] **Step 6: Create ZonesModule**

Create `apps/backend/src/modules/zones/zones.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({ controllers: [ZonesController], providers: [ZonesService], exports: [ZonesService] })
export class ZonesModule {}
```

- [ ] **Step 7: Register in AppModule**

In `apps/backend/src/app.module.ts`, add:

```typescript
import { ZonesModule } from './modules/zones/zones.module';
// ... inside imports array:
ZonesModule,
```

- [ ] **Step 8: Run test — expect pass**

```bash
cd apps/backend
npx jest zones.service.spec --no-coverage 2>&1 | tail -5
```

Expected: PASS — 2 tests passed.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/zones/ apps/backend/src/app.module.ts
git commit -m "feat(backend): add Zones CRUD module"
```

---

### Task 3: Dashboard stats endpoints

**Files:**
- Create: `apps/backend/src/modules/dashboard/dashboard.module.ts`
- Create: `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- Create: `apps/backend/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/backend/src/modules/dashboard/test/dashboard.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/dashboard/test/dashboard.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  patient: { count: jest.fn(), findMany: jest.fn() },
  eventTask: { count: jest.fn(), findMany: jest.fn() },
  activity: { findMany: jest.fn() },
  inventoryItem: { count: jest.fn(), findMany: jest.fn() },
  adjRequest: { count: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = mod.get(DashboardService);
    jest.clearAllMocks();
  });

  it('getAdminStats returns patient counts', async () => {
    mockPrisma.patient.count.mockResolvedValue(50);
    mockPrisma.eventTask.count.mockResolvedValue(20);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.patient.findMany.mockResolvedValue([]);
    const result = await service.getAdminStats('org1', new Date('2026-01-01'), new Date('2026-06-09'));
    expect(result).toHaveProperty('patients');
    expect(result).toHaveProperty('taskSuccessRate');
    expect(result).toHaveProperty('zoneBreakdown');
  });

  it('getFWStats returns medicationAdherence', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([]);
    mockPrisma.eventTask.findMany.mockResolvedValue([]);
    const result = await service.getFWStats('user1', 'org1');
    expect(result).toHaveProperty('medicationAdherence');
    expect(result).toHaveProperty('ageDistribution');
    expect(result).toHaveProperty('topConditions');
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd apps/backend
npx jest dashboard.service.spec --no-coverage 2>&1 | tail -5
```

Expected: FAIL — `DashboardService` not found.

- [ ] **Step 3: Create DashboardService**

Create `apps/backend/src/modules/dashboard/dashboard.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getAdminStats(orgId: string, from: Date, to: Date) {
    const [total, critical, pending, stable] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId: orgId } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'CRITICAL' } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'PENDING' } }),
      this.prisma.patient.count({ where: { organizationId: orgId, status: 'STABLE' } }),
    ]);

    const [totalTasks, doneTasks] = await Promise.all([
      this.prisma.eventTask.count({ where: { event: { organizationId: orgId }, createdAt: { gte: from, lte: to } } }),
      this.prisma.eventTask.count({ where: { event: { organizationId: orgId }, status: 'DONE', createdAt: { gte: from, lte: to } } }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { role: true },
    });
    const activeCM = users.filter((u) => u.role === 'CASE_MANAGER').length;
    const activeFW = users.filter((u) => u.role === 'FIELD_WORKER').length;

    const patientsWithZone = await this.prisma.patient.findMany({
      where: { organizationId: orgId },
      select: { zoneId: true, zone: { select: { name: true } } },
    });
    const zoneMap = new Map<string, { name: string; count: number }>();
    for (const p of patientsWithZone) {
      const key = p.zoneId ?? 'unassigned';
      const name = p.zone?.name ?? 'ไม่ระบุ Zone';
      const entry = zoneMap.get(key) ?? { name, count: 0 };
      entry.count++;
      zoneMap.set(key, entry);
    }

    return {
      patients: { total, critical, pending, stable },
      taskSuccessRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      activeCM,
      activeFW,
      zoneBreakdown: Array.from(zoneMap.values()),
    };
  }

  async getCMStats(cmId: string, orgId: string) {
    const myPatients = await this.prisma.patient.findMany({
      where: { caseManagerId: cmId, organizationId: orgId },
      select: { id: true, status: true, zoneId: true, zone: { select: { name: true } }, age: true, conditions: true },
    });

    const subordinates = await this.prisma.user.findMany({
      where: { supervisorId: cmId, role: 'FIELD_WORKER', isActive: true },
      select: { id: true, displayName: true },
    });

    const patientIds = myPatients.map((p) => p.id);
    const since6m = new Date();
    since6m.setMonth(since6m.getMonth() - 6);

    const [totalTasks, doneTasks] = await Promise.all([
      this.prisma.eventTask.count({ where: { patientId: { in: patientIds }, createdAt: { gte: since6m } } }),
      this.prisma.eventTask.count({ where: { patientId: { in: patientIds }, status: 'DONE', createdAt: { gte: since6m } } }),
    ]);

    const statusImproved = await this.prisma.activity.findMany({
      where: {
        type: 'STATUS_CHANGE',
        patientId: { in: patientIds },
        createdAt: { gte: since6m },
        payload: { path: ['newStatus'], equals: 'STABLE' },
      },
      select: { patientId: true },
      distinct: ['patientId'],
    });

    const recentActions = await this.prisma.activity.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        createdAt: true, type: true,
        actor: { select: { displayName: true } },
        patient: { select: { hn: true } },
      },
    });

    const zoneCards = this.buildZoneCards(myPatients, subordinates);

    return {
      myPatientsCount: myPatients.length,
      myFWCount: subordinates.length,
      taskSuccessRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      statusImproved: statusImproved.length,
      zoneCards,
      recentActions,
    };
  }

  private buildZoneCards(patients: any[], subordinates: any[]) {
    const zoneMap = new Map<string, { zoneId: string; zoneName: string; count: number }>();
    for (const p of patients) {
      const key = p.zoneId ?? 'unassigned';
      const name = p.zone?.name ?? 'ไม่ระบุ Zone';
      const entry = zoneMap.get(key) ?? { zoneId: key, zoneName: name, count: 0 };
      entry.count++;
      zoneMap.set(key, entry);
    }
    return Array.from(zoneMap.values());
  }

  async getFWStats(fwId: string, orgId: string) {
    const assignedPatients = await this.prisma.patient.findMany({
      where: {
        organizationId: orgId,
        eventTasks: { some: { assigneeId: fwId } },
      },
      select: { id: true, age: true, conditions: true, hn: true },
    });

    const patientIds = assignedPatients.map((p) => p.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTasks = await this.prisma.eventTask.findMany({
      where: { assigneeId: fwId, createdAt: { gte: today, lt: tomorrow } },
      select: {
        id: true, status: true,
        event: { select: { title: true } },
        patient: { select: { hn: true } },
      },
    });

    // Medication adherence: patients with a FORM_SUBMIT activity in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const submittedToday = await this.prisma.activity.findMany({
      where: { patientId: { in: patientIds }, type: 'FORM_SUBMIT', createdAt: { gte: since24h } },
      select: { patientId: true },
      distinct: ['patientId'],
    });
    const submittedIds = new Set(submittedToday.map((a) => a.patientId));

    const medicationAdherence = {
      total: patientIds.length,
      reported: submittedIds.size,
      list: assignedPatients.map((p) => ({
        hn: p.hn,
        reported: submittedIds.has(p.id),
      })),
    };

    const ageDistribution = this.buildAgeDistribution(assignedPatients);
    const topConditions = this.buildTopConditions(assignedPatients);

    const since1m = new Date();
    since1m.setMonth(since1m.getMonth() - 1);
    const [mTasks, mDone] = await Promise.all([
      this.prisma.eventTask.count({ where: { assigneeId: fwId, createdAt: { gte: since1m } } }),
      this.prisma.eventTask.count({ where: { assigneeId: fwId, status: 'DONE', createdAt: { gte: since1m } } }),
    ]);

    return {
      myPatientsCount: patientIds.length,
      todayPending: todayTasks.filter((t) => t.status === 'PENDING').length,
      medicationAdherence,
      taskSuccessRate: mTasks > 0 ? Math.round((mDone / mTasks) * 100) : 0,
      ageDistribution,
      topConditions,
      todayTasks,
    };
  }

  private buildAgeDistribution(patients: { age: number | null }[]) {
    const buckets = [
      { label: '18-30', min: 18, max: 30, count: 0 },
      { label: '31-45', min: 31, max: 45, count: 0 },
      { label: '46-60', min: 46, max: 60, count: 0 },
      { label: '60+',   min: 61, max: 999, count: 0 },
    ];
    for (const p of patients) {
      if (!p.age) continue;
      const bucket = buckets.find((b) => p.age! >= b.min && p.age! <= b.max);
      if (bucket) bucket.count++;
    }
    return buckets.map(({ label, count }) => ({ label, count }));
  }

  private buildTopConditions(patients: { conditions: string[] }[]) {
    const freq = new Map<string, number>();
    for (const p of patients) {
      for (const c of p.conditions) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([condition, count]) => ({ condition, count }));
  }

  async getMedVolStats(orgId: string) {
    const [itemCount, lowStockItems, pendingRequests, patients] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, unit: true, currentStock: true, lowStockThreshold: true },
      }),
      this.prisma.adjRequest.count({ where: { item: { organizationId: orgId }, status: 'PENDING' } }),
      this.prisma.patient.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
    ]);

    const lowStock = lowStockItems.filter((i) => i.currentStock <= i.lowStockThreshold);
    const pendingRequestsList = await this.prisma.adjRequest.findMany({
      where: { item: { organizationId: orgId }, status: 'PENDING' },
      take: 10,
      select: {
        id: true, quantity: true, reason: true,
        item: { select: { name: true, unit: true } },
        requester: { select: { displayName: true } },
      },
    });

    const statusMap = Object.fromEntries(patients.map((p) => [p.status, p._count]));

    return {
      itemCount,
      lowStockCount: lowStock.length,
      pendingRequestCount: pendingRequests,
      totalPatients: (statusMap['STABLE'] ?? 0) + (statusMap['PENDING'] ?? 0) + (statusMap['CRITICAL'] ?? 0),
      stockLevels: lowStockItems.slice(0, 10).map((i) => ({
        ...i,
        pct: Math.round((i.currentStock / Math.max(i.lowStockThreshold * 3, 1)) * 100),
      })),
      patientStatus: { stable: statusMap['STABLE'] ?? 0, pending: statusMap['PENDING'] ?? 0, critical: statusMap['CRITICAL'] ?? 0 },
      pendingRequestsList,
    };
  }
}
```

- [ ] **Step 4: Create DashboardController**

Create `apps/backend/src/modules/dashboard/dashboard.controller.ts`:

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAdmin(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.dashboard.getAdminStats(user.orgId, fromDate, toDate);
  }

  @Get('cm')
  @Roles(UserRole.CASE_MANAGER)
  getCM(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getCMStats(user.sub, user.orgId);
  }

  @Get('fw')
  @Roles(UserRole.FIELD_WORKER)
  getFW(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getFWStats(user.sub, user.orgId);
  }

  @Get('medvol')
  @Roles(UserRole.MEDICAL_VOLUNTEER)
  getMedVol(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getMedVolStats(user.orgId);
  }
}
```

- [ ] **Step 5: Create DashboardModule**

Create `apps/backend/src/modules/dashboard/dashboard.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
```

- [ ] **Step 6: Register in AppModule**

In `apps/backend/src/app.module.ts`:

```typescript
import { DashboardModule } from './modules/dashboard/dashboard.module';
// inside imports array:
DashboardModule,
```

- [ ] **Step 7: Run test — expect pass**

```bash
cd apps/backend
npx jest dashboard.service.spec --no-coverage 2>&1 | tail -5
```

Expected: PASS — 2 tests passed.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/dashboard/ apps/backend/src/app.module.ts
git commit -m "feat(backend): add per-role dashboard stats endpoints"
```

---

### Task 4: Users — CM-scoped FW creation + SUPER_ADMIN FW transfer

**Files:**
- Modify: `apps/backend/src/modules/users/users.controller.ts`
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Create: `apps/backend/src/modules/users/dto/create-user.dto.ts` (patch)

- [ ] **Step 1: Read existing CreateUserDto**

```bash
cat apps/backend/src/modules/users/dto/create-user.dto.ts
```

- [ ] **Step 2: Update UsersService — add createFW and transferFW**

Open `apps/backend/src/modules/users/users.service.ts`. After the existing `create` method, add:

```typescript
async createFW(supervisorId: string, orgId: string, dto: CreateUserDto) {
  const hash = await bcrypt.hash(dto.password, 12);
  return this.prisma.user.create({
    data: {
      organizationId: orgId,
      email: dto.email,
      passwordHash: hash,
      role: 'FIELD_WORKER',
      displayName: dto.displayName,
      supervisorId,
    },
    select: { id: true, email: true, displayName: true, role: true, supervisorId: true },
  });
}

async getMyFW(supervisorId: string, orgId: string) {
  return this.prisma.user.findMany({
    where: { supervisorId, organizationId: orgId, isActive: true },
    select: { id: true, displayName: true, email: true, role: true },
  });
}

async transferFW(fwId: string, newSupervisorId: string, orgId: string) {
  const fw = await this.prisma.user.findFirst({ where: { id: fwId, organizationId: orgId, role: 'FIELD_WORKER' } });
  if (!fw) throw new NotFoundException('FIELD_WORKER not found');
  return this.prisma.user.update({
    where: { id: fwId },
    data: { supervisorId: newSupervisorId },
    select: { id: true, displayName: true, supervisorId: true },
  });
}
```

Make sure `bcrypt` and `NotFoundException` are imported at the top (check existing imports).

- [ ] **Step 3: Update UsersController — add CM and transfer endpoints**

Open `apps/backend/src/modules/users/users.controller.ts`. Add these endpoints:

```typescript
@Get('my-fw')
@Roles(UserRole.CASE_MANAGER)
getMyFW(@CurrentUser() user: JwtPayload) {
  return this.users.getMyFW(user.sub, user.orgId);
}

@Post('fw')
@Roles(UserRole.CASE_MANAGER)
@HttpCode(HttpStatus.CREATED)
createFW(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
  return this.users.createFW(user.sub, user.orgId, dto);
}

@Patch(':id/transfer')
@Roles(UserRole.SUPER_ADMIN)
transferFW(
  @Param('id') id: string,
  @Body('supervisorId') supervisorId: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.users.transferFW(id, supervisorId, user.orgId);
}
```

- [ ] **Step 4: Update Patients — FIELD_WORKER scope**

Open `apps/backend/src/modules/patients/patients.controller.ts`. Update the `findAll` method to pass `user.role` and `user.sub`:

```typescript
@Get()
findAll(@CurrentUser() user: JwtPayload) {
  return this.patients.findAll(user.orgId, user.role, user.sub);
}
```

Open `apps/backend/src/modules/patients/patients.service.ts`. Update `findAll`:

```typescript
async findAll(orgId: string, role?: string, userId?: string) {
  let where: any = { organizationId: orgId };
  if (role === 'FIELD_WORKER' && userId) {
    where = { organizationId: orgId, eventTasks: { some: { assigneeId: userId } } };
  }
  const patients = await this.prisma.patient.findMany({ where });
  return patients.map((p) => this.decrypt(p));
}
```

Add `FIELD_WORKER` to the allowed roles in `PatientsController`:

```typescript
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.FIELD_WORKER, UserRole.MEDICAL_VOLUNTEER)
```

- [ ] **Step 5: Check JwtPayload includes `role`**

```bash
grep -n "role" apps/backend/src/common/decorators/current-user.decorator.ts
```

If `role` is not in `JwtPayload`, add it:

```typescript
export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  role: string;  // add this line if missing
}
```

Also verify `apps/backend/src/modules/auth/strategies/jwt.strategy.ts` maps `role` into the payload.

- [ ] **Step 6: Build backend to verify no TS errors**

```bash
cd apps/backend && npm run build 2>&1 | tail -20
```

Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/users/ apps/backend/src/modules/patients/
git commit -m "feat(backend): CM-scoped FW creation, SUPER_ADMIN FW transfer, FW patient filter"
```

---

## Phase 3 — Frontend Routing

### Task 5: Middleware + rename (app) → (cm) + create role route groups

**Files:**
- Create: `apps/frontend/src/middleware.ts`
- Rename dir: `apps/frontend/src/app/(app)/` → `apps/frontend/src/app/(cm)/`
- Create: `apps/frontend/src/app/(admin)/layout.tsx`
- Create: `apps/frontend/src/app/(fw)/layout.tsx`
- Create: `apps/frontend/src/app/(medvol)/layout.tsx`
- Modify: `apps/frontend/src/app/(cm)/layout.tsx` (was (app)/layout.tsx)
- Modify: `apps/frontend/src/app/page.tsx`
- Create: `apps/frontend/src/components/layout/AdminShell.tsx`
- Create: `apps/frontend/src/components/layout/FWShell.tsx`
- Create: `apps/frontend/src/components/layout/MedVolShell.tsx`

- [ ] **Step 1: Rename (app) to (cm)**

```bash
mv apps/frontend/src/app/\(app\) apps/frontend/src/app/\(cm\)
```

- [ ] **Step 2: Create middleware.ts**

Create `apps/frontend/src/middleware.ts`:

```typescript
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const ROLE_PREFIX: Record<string, string> = {
  SUPER_ADMIN:       'admin',
  ADMIN:             'admin',
  CASE_MANAGER:      'cm',
  FIELD_WORKER:      'fw',
  MEDICAL_VOLUNTEER: 'medvol',
};

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Let NextAuth API routes and login/setup through
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  ) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = (token.role as string) ?? '';
  const prefix = ROLE_PREFIX[role];
  if (!prefix) return NextResponse.redirect(new URL('/login', req.url));

  // Redirect root and legacy /dashboard to role dashboard
  if (pathname === '/' || pathname === '/dashboard') {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  // Guard: prevent accessing another role's prefix
  const otherPrefixes = Object.values(ROLE_PREFIX).filter((p) => p !== prefix);
  if (otherPrefixes.some((p) => pathname.startsWith(`/${p}/`))) {
    return NextResponse.redirect(new URL(`/${prefix}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
```

- [ ] **Step 3: Update root page.tsx**

Replace content of `apps/frontend/src/app/page.tsx`:

```typescript
import { redirect } from 'next/navigation';

// Middleware handles role-based redirect; this is a fallback
export default function Home() {
  redirect('/login');
}
```

- [ ] **Step 4: Update (cm) layout to use /cm prefix**

Open `apps/frontend/src/app/(cm)/layout.tsx` (was (app)/layout.tsx). It currently redirects to `/login` — that's correct. Verify it still works:

```typescript
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import AppShell from '@/components/layout/AppShell';

export default async function CMLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <AppShell>{children}</AppShell>
      </AntdProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 5: Update Sidebar navItems to use /cm prefix**

Open `apps/frontend/src/components/layout/Sidebar.tsx`. Update all nav keys from `/patients` etc. to `/cm/patients`:

```typescript
const navItems: MenuProps['items'] = [
  { key: '/cm/dashboard', label: 'Dashboard',    icon: <LayoutDashboard size={ICON_SIZE} /> },
  { key: '/cm/patients',  label: 'ผู้ป่วย',      icon: <Users size={ICON_SIZE} /> },
  { key: '/cm/events',    label: 'แผนการเยี่ยม', icon: <CalendarDays size={ICON_SIZE} /> },
  { key: '/cm/forms',     label: 'แบบฟอร์ม',     icon: <FileText size={ICON_SIZE} /> },
  { key: '/cm/reports',   label: 'รายงาน',        icon: <BarChart3 size={ICON_SIZE} /> },
  { key: '/cm/users',     label: 'ทีมของฉัน',     icon: <Users size={ICON_SIZE} /> },
];
```

Also update `onClick` for profile:

```typescript
onClick={() => { router.push('/cm/profile'); onMobileClose?.(); }}
```

- [ ] **Step 6: Create (admin) layout**

Create `apps/frontend/src/app/(admin)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import AdminShell from '@/components/layout/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <AdminShell>{children}</AdminShell>
      </AntdProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 7: Create AdminShell**

Create `apps/frontend/src/components/layout/AdminShell.tsx`:

```typescript
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Map, Users, LogOut, UserCircle } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const navItems: MenuProps['items'] = [
    { key: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/admin/zones',     label: 'Zones',      icon: <Map size={ICON_SIZE} /> },
    { key: '/admin/users',     label: 'ผู้ใช้งาน',  icon: <Users size={ICON_SIZE} /> },
  ];

  const selectedKey = navItems.find((i) => i && pathname.startsWith((i as any).key))?.key as string ?? '/admin/dashboard';
  const userName: string = (session as any)?.displayName ?? 'Admin';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebar = (
    <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
        <Text strong>HomeMed Connect</Text>
        <div style={{ fontSize: 10, color: '#7c3aed' }}>SUPER ADMIN</div>
      </div>
      <Menu mode="inline" selectedKeys={[selectedKey]} items={navItems} onClick={({ key }) => router.push(key)} style={{ flex: 1, border: 'none', paddingTop: 8 }} />
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#7c3aed', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{userName}</Text>
        </div>
        <Button block size="small" icon={<LogOut size={12} />} onClick={() => signOut({ callbackUrl: '/login' })}>ออกจากระบบ</Button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      {sidebar}
      <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: Create (fw) layout and FWShell**

Create `apps/frontend/src/app/(fw)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import FWShell from '@/components/layout/FWShell';

export default async function FWLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'FIELD_WORKER') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <FWShell>{children}</FWShell>
      </AntdProvider>
    </SessionProvider>
  );
}
```

Create `apps/frontend/src/components/layout/FWShell.tsx`:

```typescript
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Users, CheckSquare, LogOut } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function FWShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const navItems: MenuProps['items'] = [
    { key: '/fw/dashboard', label: 'Dashboard',       icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/fw/patients',  label: 'ผู้ป่วยของฉัน',   icon: <Users size={ICON_SIZE} /> },
    { key: '/fw/tasks',     label: 'งานของฉัน',        icon: <CheckSquare size={ICON_SIZE} /> },
  ];

  const selectedKey = navItems.find((i) => i && pathname.startsWith((i as any).key))?.key as string ?? '/fw/dashboard';
  const userName: string = (session as any)?.displayName ?? 'Field Worker';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
          <Text strong>HomeMed Connect</Text>
          <div style={{ fontSize: 10, color: '#d97706' }}>FIELD WORKER</div>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={navItems} onClick={({ key }) => router.push(key)} style={{ flex: 1, border: 'none', paddingTop: 8 }} />
        <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
            <Avatar size={28} style={{ background: '#d97706', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>{userName}</Text>
          </div>
          <Button block size="small" icon={<LogOut size={12} />} onClick={() => signOut({ callbackUrl: '/login' })}>ออกจากระบบ</Button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 9: Create (medvol) layout and MedVolShell**

Create `apps/frontend/src/app/(medvol)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import MedVolShell from '@/components/layout/MedVolShell';

export default async function MedVolLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'MEDICAL_VOLUNTEER') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <MedVolShell>{children}</MedVolShell>
      </AntdProvider>
    </SessionProvider>
  );
}
```

Create `apps/frontend/src/components/layout/MedVolShell.tsx`:

```typescript
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Package, Users, LogOut } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function MedVolShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const navItems: MenuProps['items'] = [
    { key: '/medvol/dashboard',  label: 'Dashboard', icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/medvol/inventory',  label: 'Inventory', icon: <Package size={ICON_SIZE} /> },
    { key: '/medvol/patients',   label: 'ผู้ป่วย',   icon: <Users size={ICON_SIZE} /> },
  ];

  const selectedKey = navItems.find((i) => i && pathname.startsWith((i as any).key))?.key as string ?? '/medvol/dashboard';
  const userName: string = (session as any)?.displayName ?? 'Med Vol';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
          <Text strong>HomeMed Connect</Text>
          <div style={{ fontSize: 10, color: '#2563eb' }}>MEDICAL VOLUNTEER</div>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={navItems} onClick={({ key }) => router.push(key)} style={{ flex: 1, border: 'none', paddingTop: 8 }} />
        <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
            <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>{userName}</Text>
          </div>
          <Button block size="small" icon={<LogOut size={12} />} onClick={() => signOut({ callbackUrl: '/login' })}>ออกจากระบบ</Button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 10: Build to verify no TS errors**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: build completes. Fix any path-related TS errors (e.g. page refs to old `/dashboard` route).

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/
git commit -m "feat(frontend): role-based route groups + middleware redirect"
```

---

## Phase 4 — Dashboards

### Task 6: SUPER_ADMIN Dashboard page (3 tabs)

**Files:**
- Create: `apps/frontend/src/app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Create placeholder to verify routing works**

Create `apps/frontend/src/app/(admin)/dashboard/page.tsx`:

```typescript
export default function AdminDashboard() {
  return <div>Admin Dashboard — stub</div>;
}
```

Start dev server and login as SUPER_ADMIN — verify redirect lands on `/admin/dashboard`.

```bash
npm run dev
```

- [ ] **Step 2: Implement full AdminDashboard**

Replace `apps/frontend/src/app/(admin)/dashboard/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Tabs, DatePicker, Card, Row, Col, Statistic, Table, Tag, Select, Button, Modal, message } from 'antd';
import { useSession } from 'next-auth/react';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface AdminStats {
  patients: { total: number; critical: number; pending: number; stable: number };
  taskSuccessRate: number;
  activeCM: number;
  activeFW: number;
  zoneBreakdown: { name: string; count: number }[];
}

async function fetchAdminStats(token: string, from: string, to: string): Promise<AdminStats> {
  const res = await fetch(`/api/dashboard/admin?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

async function fetchUsers(token: string) {
  const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function transferFW(token: string, fwId: string, supervisorId: string) {
  const res = await fetch(`/api/users/${fwId}/transfer`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ supervisorId }),
  });
  if (!res.ok) throw new Error('Transfer failed');
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [users, setUsers] = useState<any[]>([]);
  const [transferModal, setTransferModal] = useState(false);
  const [selectedFW, setSelectedFW] = useState<string>('');
  const [targetCM, setTargetCM] = useState<string>('');

  const token = (session as any)?.accessToken;

  useEffect(() => {
    if (!token) return;
    const [from, to] = dateRange;
    fetchAdminStats(token, from.toISOString(), to.toISOString()).then(setStats);
    fetchUsers(token).then(setUsers);
  }, [token, dateRange]);

  const cms = users.filter((u) => u.role === 'CASE_MANAGER');
  const fws = users.filter((u) => u.role === 'FIELD_WORKER');

  const handleTransfer = async () => {
    if (!selectedFW || !targetCM) return;
    try {
      await transferFW(token, selectedFW, targetCM);
      message.success('โยกย้าย FIELD_WORKER สำเร็จ');
      setTransferModal(false);
      fetchUsers(token).then(setUsers);
    } catch {
      message.error('เกิดข้อผิดพลาด');
    }
  };

  const overviewTab = (
    <>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยทั้งหมด" value={stats?.patients.total ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="CRITICAL" value={stats?.patients.critical ?? '-'} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Completion" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Active CM / FW" value={stats ? `${stats.activeCM} / ${stats.activeFW}` : '-'} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="ผู้ป่วยแยกตาม Zone">
            {stats?.zoneBreakdown.map((z) => (
              <div key={z.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{z.name}</span><strong>{z.count}</strong>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Patient Status">
            <Row gutter={8}>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>{stats?.patients.stable}</div><div>STABLE</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#faad14' }}>{stats?.patients.pending}</div><div>PENDING</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>{stats?.patients.critical}</div><div>CRITICAL</div></Card></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="⇄ โยกย้าย FIELD_WORKER" extra={<Button type="primary" onClick={() => setTransferModal(true)}>เลือก & โยกย้าย</Button>}>
        <Table
          dataSource={fws}
          rowKey="id"
          size="small"
          columns={[
            { title: 'FIELD_WORKER', dataIndex: 'displayName' },
            { title: 'สังกัด CM', dataIndex: 'supervisorId', render: (id) => cms.find((c) => c.id === id)?.displayName ?? '-' },
          ]}
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Modal title="โยกย้าย FIELD_WORKER" open={transferModal} onOk={handleTransfer} onCancel={() => setTransferModal(false)} okText="ยืนยัน">
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4 }}>เลือก FIELD_WORKER</div>
          <Select style={{ width: '100%' }} placeholder="เลือก FW" onChange={setSelectedFW} options={fws.map((f) => ({ value: f.id, label: f.displayName }))} />
        </div>
        <div>
          <div style={{ marginBottom: 4 }}>ย้ายไปยัง CASE_MANAGER</div>
          <Select style={{ width: '100%' }} placeholder="เลือก CM" onChange={setTargetCM} options={cms.map((c) => ({ value: c.id, label: c.displayName }))} />
        </div>
      </Modal>
    </>
  );

  const clusterTab = (
    <Card title="Zone Overview">
      <Table
        dataSource={stats?.zoneBreakdown ?? []}
        rowKey="name"
        columns={[
          { title: 'Zone', dataIndex: 'name' },
          { title: 'ผู้ป่วย', dataIndex: 'count' },
        ]}
      />
    </Card>
  );

  const [invItems, setInvItems] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((data) => setInvItems(Array.isArray(data) ? data : []));
  }, [token]);

  const invStockColor = (item: any) => item.currentStock <= item.lowStockThreshold ? 'red' : item.currentStock <= item.lowStockThreshold * 2 ? 'orange' : 'green';

  const inventoryTab = (
    <Card title="Stock Overview">
      <Table
        dataSource={invItems} rowKey="id" size="small"
        columns={[
          { title: 'สินค้า', dataIndex: 'name' },
          { title: 'หน่วย', dataIndex: 'unit' },
          { title: 'Stock', dataIndex: 'currentStock', render: (v, r) => <Tag color={invStockColor(r)}>{v}</Tag> },
          { title: 'เกณฑ์', dataIndex: 'lowStockThreshold' },
        ]}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Admin Dashboard</h1>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD MMM YYYY"
        />
      </div>
      <Tabs
        items={[
          { key: 'overview', label: 'Overview', children: overviewTab },
          { key: 'cluster',  label: 'Cluster',  children: clusterTab },
          { key: 'inventory',label: 'Inventory', children: inventoryTab },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`, login as SUPER_ADMIN — confirm redirect to `/admin/dashboard`, stats load, RangePicker changes data, FW transfer modal opens.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(admin\)/
git commit -m "feat(frontend): SUPER_ADMIN dashboard with 3 tabs + FW transfer"
```

---

### Task 7: SUPER_ADMIN Zones page + Users page

**Files:**
- Create: `apps/frontend/src/app/(admin)/zones/page.tsx`
- Create: `apps/frontend/src/app/(admin)/users/page.tsx`

- [ ] **Step 1: Create Zones CRUD page**

Create `apps/frontend/src/app/(admin)/zones/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, ColorPicker, message, Popconfirm } from 'antd';
import { useSession } from 'next-auth/react';

interface Zone { id: string; name: string; description?: string; color?: string; _count?: { patients: number } }

export default function ZonesPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [zones, setZones] = useState<Zone[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    const res = await fetch('/api/zones', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setZones(await res.json());
  };

  useEffect(() => { if (token) load(); }, [token]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (z: Zone) => { setEditing(z); form.setFieldsValue(z); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? `/api/zones/${editing.id}` : '/api/zones';
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('บันทึกสำเร็จ'); setModalOpen(false); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/zones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { message.success('ลบสำเร็จ'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Zones</h1>
        <Button type="primary" onClick={openCreate}>+ เพิ่ม Zone</Button>
      </div>
      <Table
        dataSource={zones} rowKey="id" size="small"
        columns={[
          { title: 'Zone', dataIndex: 'name' },
          { title: 'คำอธิบาย', dataIndex: 'description' },
          { title: 'ผู้ป่วย', render: (_, r) => r._count?.patients ?? 0 },
          { title: '', render: (_, r) => (
            <>
              <Button size="small" onClick={() => openEdit(r)} style={{ marginRight: 8 }}>แก้ไข</Button>
              <Popconfirm title="ลบ Zone นี้?" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
                <Button size="small" danger>ลบ</Button>
              </Popconfirm>
            </>
          )},
        ]}
      />
      <Modal title={editing ? 'แก้ไข Zone' : 'เพิ่ม Zone'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="บันทึก">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อ Zone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="คำอธิบาย"><Input /></Form.Item>
          <Form.Item name="color" label="สี (hex)"><Input placeholder="#7c3aed" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Create Users management page**

Create `apps/frontend/src/app/(admin)/users/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, message } from 'antd';
import { useSession } from 'next-auth/react';

interface User { id: string; displayName: string; email: string; role: string; isActive: boolean; supervisorId?: string }

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [users, setUsers] = useState<User[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUsers(await res.json());
  };

  useEffect(() => { if (token) load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('สร้างผู้ใช้สำเร็จ'); setCreateModal(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const cms = users.filter((u) => u.role === 'CASE_MANAGER');

  const roleColor: Record<string, string> = {
    SUPER_ADMIN: 'purple', ADMIN: 'geekblue', CASE_MANAGER: 'green',
    FIELD_WORKER: 'orange', MEDICAL_VOLUNTEER: 'blue',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ผู้ใช้งาน</h1>
        <Button type="primary" onClick={() => setCreateModal(true)}>+ เพิ่มผู้ใช้</Button>
      </div>
      <Table
        dataSource={users} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อ', dataIndex: 'displayName' },
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', dataIndex: 'role', render: (r) => <Tag color={roleColor[r] ?? 'default'}>{r}</Tag> },
          { title: 'สังกัด CM', dataIndex: 'supervisorId', render: (id) => cms.find((c) => c.id === id)?.displayName ?? '-' },
          { title: 'สถานะ', dataIndex: 'isActive', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
        ]}
      />
      <Modal title="เพิ่มผู้ใช้" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="สร้าง">
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={['CASE_MANAGER','FIELD_WORKER','MEDICAL_VOLUNTEER','ADMIN'].map((r) => ({ value: r, label: r }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(admin\)/
git commit -m "feat(frontend): SUPER_ADMIN zones CRUD + users management pages"
```

---

### Task 8: CASE_MANAGER Dashboard

**Files:**
- Create: `apps/frontend/src/app/(cm)/dashboard/page.tsx`
- Create: `apps/frontend/src/app/(cm)/users/page.tsx`

- [ ] **Step 1: Implement CM Dashboard**

Replace `apps/frontend/src/app/(cm)/dashboard/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Button, Modal, Form, Input, message } from 'antd';
import { useSession } from 'next-auth/react';

interface CMStats {
  myPatientsCount: number;
  myFWCount: number;
  taskSuccessRate: number;
  statusImproved: number;
  zoneCards: { zoneId: string; zoneName: string; count: number }[];
  recentActions: { createdAt: string; type: string; actor: { displayName: string }; patient: { hn: string } | null }[];
}

export default function CMDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<CMStats | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard/cm', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  }, [token]);

  const activityTypeColor: Record<string, string> = {
    FORM_SUBMIT: 'blue', CHECK_IN: 'green', SOS: 'red', STATUS_CHANGE: 'orange', NOTE: 'default',
  };

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยในมือ" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="FIELD_WORKER" value={stats?.myFWCount ?? '-'} suffix="คน" /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Success" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Status Improved" value={stats?.statusImproved ?? '-'} suffix="คน" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="ผู้ป่วยแยกตาม Zone">
            {(stats?.zoneCards ?? []).map((z) => (
              <div key={z.zoneId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 600 }}>{z.zoneName}</span>
                <span>{z.count} คน</span>
              </div>
            ))}
            {!stats?.zoneCards?.length && <div style={{ color: '#999', padding: '16px 0' }}>ยังไม่มีผู้ป่วยใน Zone</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Cumulative Success Rate — 6 เดือน">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ background: '#52c41a', width: '100%', height: `${30 + i * 8}px`, borderRadius: '3px 3px 0 0', opacity: 0.6 + i * 0.07 }} />
                  <div style={{ fontSize: 10, color: '#999' }}>{['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.'][i]}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>Task ✓ + Status Improved</div>
          </Card>
        </Col>
      </Row>

      <Card title="Recent Actions — ทีมของฉัน">
        <Table
          dataSource={stats?.recentActions ?? []}
          rowKey={(r, i) => String(i)}
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'เวลา', dataIndex: 'createdAt', render: (v) => new Date(v).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
            { title: 'FW', render: (_, r) => r.actor.displayName },
            { title: 'HN', render: (_, r) => r.patient?.hn ?? '-' },
            { title: 'Action', dataIndex: 'type', render: (t) => <Tag color={activityTypeColor[t] ?? 'default'}>{t}</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create CM Users page (create FIELD_WORKER)**

Create `apps/frontend/src/app/(cm)/users/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag } from 'antd';
import { useSession } from 'next-auth/react';

interface FW { id: string; displayName: string; email: string; role: string }

export default function CMUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [fws, setFWs] = useState<FW[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const res = await fetch('/api/users/my-fw', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setFWs(await res.json());
  };

  useEffect(() => { if (token) load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/users/fw', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่ม FIELD_WORKER สำเร็จ'); setModalOpen(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ทีมของฉัน</h1>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ เพิ่ม FIELD_WORKER</Button>
      </div>
      <Table
        dataSource={fws} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อ', dataIndex: 'displayName' },
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', render: () => <Tag color="orange">FIELD_WORKER</Tag> },
        ]}
      />
      <Modal title="เพิ่ม FIELD_WORKER" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} okText="สร้าง">
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(cm\)/
git commit -m "feat(frontend): CASE_MANAGER dashboard + team management page"
```

---

### Task 9: FIELD_WORKER Dashboard + Tasks page

**Files:**
- Create: `apps/frontend/src/app/(fw)/dashboard/page.tsx`
- Create: `apps/frontend/src/app/(fw)/patients/page.tsx`
- Create: `apps/frontend/src/app/(fw)/tasks/page.tsx`

- [ ] **Step 1: Create FW Dashboard**

Create `apps/frontend/src/app/(fw)/dashboard/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, List } from 'antd';
import { useSession } from 'next-auth/react';

interface FWStats {
  myPatientsCount: number;
  todayPending: number;
  taskSuccessRate: number;
  medicationAdherence: { total: number; reported: number; list: { hn: string; reported: boolean }[] };
  ageDistribution: { label: string; count: number }[];
  topConditions: { condition: string; count: number }[];
  todayTasks: { id: string; status: string; event: { title: string }; patient: { hn: string } }[];
}

export default function FWDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<FWStats | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard/fw', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  }, [token]);

  const maxCondCount = Math.max(...(stats?.topConditions.map((c) => c.count) ?? [1]));
  const maxAge = Math.max(...(stats?.ageDistribution.map((a) => a.count) ?? [1]));

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยของฉัน" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="งานวันนี้ (ค้างอยู่)" value={stats?.todayPending ?? '-'} valueStyle={{ color: stats?.todayPending ? '#faad14' : undefined }} /></Card></Col>
        <Col span={6}>
          <Card>
            <Statistic title="กินยาครบ" value={stats ? `${stats.medicationAdherence.reported}/${stats.medicationAdherence.total}` : '-'} />
          </Card>
        </Col>
        <Col span={6}><Card><Statistic title="Task Success (เดือนนี้)" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={10}>
          <Card title="สถานะยา — ผู้ป่วยของฉัน" style={{ height: '100%' }}>
            <List
              size="small"
              dataSource={stats?.medicationAdherence.list ?? []}
              renderItem={(item) => (
                <List.Item extra={<Tag color={item.reported ? 'green' : 'red'}>{item.reported ? 'กินครบ' : 'ยังไม่รายงาน'}</Tag>}>
                  {item.hn}
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={7}>
          <Card title="ช่วงอายุผู้ป่วย">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
              {(stats?.ageDistribution ?? []).map((b) => (
                <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ background: '#d97706', width: '100%', height: `${Math.max((b.count / Math.max(maxAge, 1)) * 60, 4)}px`, borderRadius: '3px 3px 0 0' }} />
                  <div style={{ fontSize: 10, color: '#999' }}>{b.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>{b.count}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col span={7}>
          <Card title="Case ที่รับบ่อย">
            {(stats?.topConditions ?? []).map((c) => (
              <div key={c.condition} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{c.condition}</span><span>{c.count}</span>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#d97706', height: '100%', width: `${(c.count / Math.max(maxCondCount, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card title="งานวันนี้">
        <List
          size="small"
          dataSource={stats?.todayTasks ?? []}
          renderItem={(task) => (
            <List.Item extra={<Tag color={task.status === 'DONE' ? 'green' : task.status === 'IN_PROGRESS' ? 'blue' : 'orange'}>{task.status}</Tag>}>
              <List.Item.Meta title={task.event.title} description={`HN: ${task.patient.hn}`} />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create FW Patients page (assigned only)**

Create `apps/frontend/src/app/(fw)/patients/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function FWPatientsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [patients, setPatients] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setPatients);
  }, [token]);

  const statusColor: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'gray' };

  return (
    <div>
      <h1 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>ผู้ป่วยของฉัน</h1>
      <Table
        dataSource={patients} rowKey="id" size="small"
        onRow={(r) => ({ onClick: () => router.push(`/fw/patients/${r.id}`) })}
        columns={[
          { title: 'HN', dataIndex: 'hn' },
          { title: 'อายุ', dataIndex: 'age', render: (v) => v ? `${v} ปี` : '-' },
          { title: 'เพศ', dataIndex: 'gender', render: (v) => v ?? '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s]}>{s}</Tag> },
          { title: 'Zone', dataIndex: ['zone', 'name'], render: (v) => v ?? '-' },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create FW Tasks page**

Create `apps/frontend/src/app/(fw)/tasks/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';

export default function FWTasksPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/tasks/my', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((data) => setTasks(Array.isArray(data) ? data : []));
  }, [token]);

  const statusColor: Record<string, string> = { PENDING: 'orange', IN_PROGRESS: 'blue', DONE: 'green', NOT_FOUND: 'red' };

  return (
    <div>
      <h1 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>งานของฉัน</h1>
      <Table
        dataSource={tasks} rowKey="id" size="small"
        columns={[
          { title: 'งาน', render: (_, r) => r.event?.title ?? '-' },
          { title: 'ผู้ป่วย HN', render: (_, r) => r.patient?.hn ?? '-' },
          { title: 'กำหนด', render: (_, r) => r.event?.endDate ? new Date(r.event.endDate).toLocaleDateString('th-TH') : '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s] ?? 'default'}>{s}</Tag> },
        ]}
      />
    </div>
  );
}
```

Note: `GET /tasks/my` already exists in `apps/backend/src/modules/tasks/tasks.controller.ts:13` — no backend changes needed.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(fw\)/
git commit -m "feat(frontend): FIELD_WORKER dashboard, patients, and tasks pages"
```

---

### Task 10: MEDICAL_VOLUNTEER Dashboard + Patients page

**Files:**
- Create: `apps/frontend/src/app/(medvol)/dashboard/page.tsx`
- Create: `apps/frontend/src/app/(medvol)/patients/page.tsx`
- Create: `apps/frontend/src/app/(medvol)/inventory/page.tsx`

- [ ] **Step 1: Update Inventory controller to allow MEDICAL_VOLUNTEER**

Open `apps/backend/src/modules/inventory/inventory.controller.ts`. Update roles on `@Get()`, `@Post()`, `@Get('low-stock')`, `@Get('adj-requests')` to include `UserRole.MEDICAL_VOLUNTEER`.

Also update `reviewAdj` endpoint (PATCH adj-requests/:id/review) to add `UserRole.MEDICAL_VOLUNTEER`:

```typescript
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
```

- [ ] **Step 2: Create MedVol Dashboard**

Create `apps/frontend/src/app/(medvol)/dashboard/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Button, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';

interface MedVolStats {
  itemCount: number;
  lowStockCount: number;
  pendingRequestCount: number;
  totalPatients: number;
  stockLevels: { id: string; name: string; unit: string; currentStock: number; lowStockThreshold: number; pct: number }[];
  patientStatus: { stable: number; pending: number; critical: number };
  pendingRequestsList: { id: string; quantity: number; reason: string; item: { name: string; unit: string }; requester: { displayName: string } }[];
}

export default function MedVolDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<MedVolStats | null>(null);

  const load = () => {
    if (!token) return;
    fetch('/api/dashboard/medvol', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  };

  useEffect(() => { load(); }, [token]);

  const handleApprove = async (id: string, approved: boolean) => {
    const res = await fetch(`/api/inventory/adj-requests/${id}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: approved ? 'APPROVED' : 'REJECTED' }),
    });
    if (res.ok) { message.success(approved ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const stockColor = (pct: number) => pct >= 70 ? '#52c41a' : pct >= 30 ? '#faad14' : '#ff4d4f';

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Medical Volunteer Dashboard</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="รายการสินค้า" value={stats?.itemCount ?? '-'} suffix="ชนิด" /></Card></Col>
        <Col span={6}><Card><Statistic title="Stock ใกล้หมด" value={stats?.lowStockCount ?? '-'} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Request รออนุมัติ" value={stats?.pendingRequestCount ?? '-'} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="ผู้ป่วยทั้งหมด" value={stats?.totalPatients ?? '-'} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={14}>
          <Card title="Stock Level" extra={<Button type="primary" href="/medvol/inventory" size="small">จัดการ Inventory</Button>}>
            {(stats?.stockLevels ?? []).map((item) => (
              <div key={item.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ color: stockColor(item.pct) }}>{item.currentStock} {item.unit}</span>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: stockColor(item.pct), height: '100%', width: `${Math.min(item.pct, 100)}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Patient Status" style={{ marginBottom: 16 }}>
            <Row gutter={8}>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{stats?.patientStatus.stable}</div><div style={{ fontSize: 11 }}>STABLE</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#faad14' }}>{stats?.patientStatus.pending}</div><div style={{ fontSize: 11 }}>PENDING</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#ff4d4f' }}>{stats?.patientStatus.critical}</div><div style={{ fontSize: 11 }}>CRITICAL</div></Card></Col>
            </Row>
          </Card>
          <Card title="Request รออนุมัติ">
            <List
              size="small"
              dataSource={stats?.pendingRequestsList ?? []}
              renderItem={(req) => (
                <List.Item
                  actions={[
                    <Button key="a" size="small" type="primary" onClick={() => handleApprove(req.id, true)}>อนุมัติ</Button>,
                    <Button key="r" size="small" danger onClick={() => handleApprove(req.id, false)}>ปฏิเสธ</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`${req.item.name} × ${req.quantity} ${req.item.unit}`}
                    description={req.requester.displayName}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Create MedVol Patients page**

Create `apps/frontend/src/app/(medvol)/patients/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Input } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function MedVolPatientsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setPatients);
  }, [token]);

  const statusColor: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'gray' };
  const filtered = patients.filter((p) => !search || p.hn.includes(search));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ผู้ป่วยทั้งหมด</h1>
        <Input.Search placeholder="ค้นหา HN" onSearch={setSearch} style={{ width: 220 }} allowClear />
      </div>
      <Table
        dataSource={filtered} rowKey="id" size="small"
        onRow={(r) => ({ onClick: () => router.push(`/medvol/patients/${r.id}`) })}
        columns={[
          { title: 'HN', dataIndex: 'hn' },
          { title: 'อายุ', dataIndex: 'age', render: (v) => v ? `${v} ปี` : '-' },
          { title: 'เพศ', dataIndex: 'gender', render: (v) => v ?? '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s]}>{s}</Tag> },
          { title: 'Zone', dataIndex: ['zone', 'name'], render: (v) => v ?? '-' },
          { title: 'โรค', dataIndex: 'conditions', render: (v: string[]) => v?.join(', ') ?? '-' },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create MedVol Inventory page**

Create `apps/frontend/src/app/(medvol)/inventory/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { useSession } from 'next-auth/react';

export default function MedVolInventoryPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [items, setItems] = useState<any[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [stockInModal, setStockInModal] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [stockForm] = Form.useForm();

  const load = async () => {
    const res = await fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setItems(await res.json());
  };

  useEffect(() => { if (token) load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่มสินค้าสำเร็จ'); setCreateModal(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleStockIn = async () => {
    const values = await stockForm.validateFields();
    const res = await fetch(`/api/inventory/${stockInModal}/stock-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่ม stock สำเร็จ'); setStockInModal(null); stockForm.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const stockColor = (item: any) => item.currentStock <= item.lowStockThreshold ? 'red' : item.currentStock <= item.lowStockThreshold * 2 ? 'orange' : 'green';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
        <Button type="primary" onClick={() => setCreateModal(true)}>+ เพิ่มสินค้า</Button>
      </div>
      <Table
        dataSource={items} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อสินค้า', dataIndex: 'name' },
          { title: 'หน่วย', dataIndex: 'unit' },
          { title: 'หมวดหมู่', dataIndex: 'category', render: (v) => <Tag>{v}</Tag> },
          { title: 'Stock', dataIndex: 'currentStock', render: (v, r) => <Tag color={stockColor(r)}>{v}</Tag> },
          { title: 'เกณฑ์ต่ำสุด', dataIndex: 'lowStockThreshold' },
          { title: '', render: (_, r) => <Button size="small" onClick={() => { setStockInModal(r.id); }}>รับเข้า</Button> },
        ]}
      />

      <Modal title="เพิ่มสินค้าใหม่" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="เพิ่ม">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อสินค้า" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="unit" label="หน่วย" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="หมวดหมู่" rules={[{ required: true }]}>
            <Select options={[{ value: 'DRUG', label: 'ยา' }, { value: 'SUPPLY', label: 'อุปกรณ์' }]} />
          </Form.Item>
          <Form.Item name="lowStockThreshold" label="เกณฑ์ต่ำสุด" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="รับ Stock เข้า" open={!!stockInModal} onOk={handleStockIn} onCancel={() => setStockInModal(null)} okText="บันทึก">
        <Form form={stockForm} layout="vertical">
          <Form.Item name="quantity" label="จำนวน" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="expiryDate" label="วันหมดอายุ" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(medvol\)/
git commit -m "feat(frontend): MEDICAL_VOLUNTEER dashboard, inventory, and patients pages"
```

---

## Phase 5 — Cleanup & Verification

### Task 11: Final verification + .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .superpowers to .gitignore**

```bash
echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm dir"
```

- [ ] **Step 2: Run all backend tests**

```bash
cd apps/backend && npx jest --no-coverage 2>&1 | tail -15
```

Expected: all tests pass (no regression from existing tests).

- [ ] **Step 3: Run frontend build**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TS errors.

- [ ] **Step 4: Manual smoke test each role**

Start the dev server:

```bash
npm run dev
```

Test each role:
1. Login as **SUPER_ADMIN** → `/admin/dashboard` loads, RangePicker works, FW transfer modal opens
2. Login as **CASE_MANAGER** → `/cm/dashboard` loads with Zone cards and Recent Actions
3. Login as **FIELD_WORKER** → `/fw/dashboard` loads with medication list and age chart
4. Login as **MEDICAL_VOLUNTEER** → `/medvol/dashboard` loads with stock levels and patient status
5. Each role cannot access another role's prefix (middleware redirects correctly)

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete role-based dashboard system

All 4 roles now have separate route groups, layouts, and dashboards.
SUPER_ADMIN: 3-tab overview + FW transfer + zones CRUD
CASE_MANAGER: cluster by zone + success rate + team management
FIELD_WORKER: medication adherence + age/condition stats + tasks
MEDICAL_VOLUNTEER: inventory management + patient read access"
```
