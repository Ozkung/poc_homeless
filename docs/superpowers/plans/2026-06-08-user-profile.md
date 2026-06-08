# User Profile & User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/profile` self-service page for all users (name, email, phone, gender, avatar, password, LINE unlink) and `/users` SA-only management page (CRUD users + roles).

**Architecture:** Extend existing `auth` controller with `/auth/me` profile endpoints; extend existing `users` module with SUPER_ADMIN CRUD; add `phone`, `gender`, `avatarUrl` to the `User` model via migration; serve uploaded avatars via `ServeStaticModule`; two new Next.js pages consume these endpoints.

**Tech Stack:** NestJS 10, Prisma 6, Multer (bundled with `@nestjs/platform-express`), `@nestjs/serve-static`, Next.js 16 App Router, antd v6, TypeScript

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | Add `phone`, `gender`, `avatarUrl` to `User` |
| Migrate | `prisma migrate dev` | Apply schema changes |
| Create | `apps/backend/src/modules/auth/dto/update-me.dto.ts` | DTO for PATCH /auth/me |
| Create | `apps/backend/src/modules/auth/dto/change-password.dto.ts` | DTO for POST /auth/me/change-password |
| Modify | `apps/backend/src/modules/auth/auth.service.ts` | Add getMe, updateMe, changePassword, unlinkLine, uploadAvatar |
| Modify | `apps/backend/src/modules/auth/auth.controller.ts` | Add GET/PATCH /auth/me, POST change-password, DELETE line, POST avatar |
| Modify | `apps/backend/src/modules/auth/auth.module.ts` | Add ServeStaticModule |
| Modify | `apps/backend/src/modules/auth/test/auth.service.spec.ts` | TDD for new service methods |
| Create | `apps/backend/src/modules/users/dto/create-user.dto.ts` | DTO for POST /users |
| Create | `apps/backend/src/modules/users/dto/update-user.dto.ts` | DTO for PATCH /users/:id |
| Modify | `apps/backend/src/modules/users/users.service.ts` | Add phone/gender/avatarUrl, SUPER_ADMIN guards, DELETE |
| Modify | `apps/backend/src/modules/users/users.controller.ts` | Change ADMIN→SUPER_ADMIN, add DELETE, proper DTOs |
| Create | `apps/backend/src/modules/users/test/users.service.spec.ts` | TDD for users service |
| Modify | `apps/backend/src/app.module.ts` | Add ServeStaticModule |
| Modify | `apps/frontend/src/lib/auth.config.ts` | Pass displayName + avatarUrl through JWT→session |
| Create | `apps/frontend/src/app/(app)/profile/page.tsx` | Self-service profile page |
| Create | `apps/frontend/src/app/(app)/users/page.tsx` | SA user management page |
| Modify | `apps/frontend/src/components/layout/Sidebar.tsx` | Add โปรไฟล์ + ผู้ใช้งาน nav items, show real displayName |
| Modify | `docker-compose.yml` | Add `uploads` named volume |

---

## Task 1: Schema — add phone, gender, avatarUrl to User

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add fields to User model**

In `apps/backend/prisma/schema.prisma`, add three lines inside `model User` after `lineUserId`:

```prisma
  phone          String?
  gender         Gender?
  avatarUrl      String?
```

The `Gender` enum (`MALE | FEMALE | OTHER`) already exists — no changes needed.

- [ ] **Step 2: Validate schema**

```bash
cd apps/backend && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 3: Migrate**

```bash
cd apps/backend && DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed npx prisma migrate dev --name add-user-profile-fields
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Generate client**

```bash
cd apps/backend && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add phone, gender, avatarUrl to User schema"
```

---

## Task 2: Auth service — me endpoints (TDD)

**Files:**
- Create: `apps/backend/src/modules/auth/dto/update-me.dto.ts`
- Create: `apps/backend/src/modules/auth/dto/change-password.dto.ts`
- Create: `apps/backend/src/modules/auth/test/auth-me.service.spec.ts`
- Modify: `apps/backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/backend/src/modules/auth/dto/update-me.dto.ts`:
```typescript
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateMeDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() currentPassword?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
}
```

Create `apps/backend/src/modules/auth/dto/change-password.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/backend/src/modules/auth/test/auth-me.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisToken } from '@nestjs-modules/ioredis';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const hash = (p: string) => bcrypt.hash(p, 10);

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockRedis = { setex: jest.fn(), del: jest.fn(), get: jest.fn() };
const mockJwt = { signAsync: jest.fn().mockResolvedValue('tok') };
const mockConfig = { get: jest.fn().mockReturnValue('15m') };

describe('AuthService — me operations', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRedisToken('default'), useValue: mockRedis },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('returns user without passwordHash', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', displayName: 'Admin', role: 'ADMIN',
        phone: '0812345678', gender: 'MALE', avatarUrl: null, lineUserId: null,
        isActive: true, createdAt: new Date(),
      });
      const result = await service.getMe('u1', 'org1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('a@b.com');
    });
  });

  describe('updateMe', () => {
    it('updates displayName and phone without touching email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('pass'), organizationId: 'org1',
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', displayName: 'New', phone: '099' });
      await service.updateMe('u1', 'org1', { displayName: 'New', phone: '099' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: 'New', phone: '099' }) }),
      );
    });

    it('requires currentPassword when changing email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('wrong'), organizationId: 'org1',
      });
      await expect(
        service.updateMe('u1', 'org1', { email: 'new@b.com', currentPassword: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws if email provided without currentPassword', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', email: 'a@b.com', passwordHash: await hash('pass'), organizationId: 'org1',
      });
      await expect(
        service.updateMe('u1', 'org1', { email: 'new@b.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    it('updates password hash when currentPassword is correct', async () => {
      const pw = await hash('OldPass1!');
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: pw, organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
      await service.changePassword('u1', 'org1', 'OldPass1!', 'NewPass2!');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
      );
    });

    it('throws UnauthorizedException on wrong current password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1', passwordHash: await hash('correct'), organizationId: 'org1',
      });
      await expect(service.changePassword('u1', 'org1', 'wrong', 'NewPass2!')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('unlinkLine', () => {
    it('sets lineUserId to null', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', lineUserId: null });
      await service.unlinkLine('u1', 'org1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lineUserId: null } }),
      );
    });
  });
});
```

- [ ] **Step 3: Run to confirm all fail**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth-me --no-coverage 2>&1 | tail -6
```

Expected: FAIL — methods not found.

- [ ] **Step 4: Implement service methods**

Add to the bottom of the `AuthService` class in `apps/backend/src/modules/auth/auth.service.ts`, after the existing `private parseTtl` method:

```typescript
async getMe(userId: string, orgId: string) {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
    select: {
      id: true, email: true, displayName: true, role: true,
      phone: true, gender: true, avatarUrl: true,
      lineUserId: true, isActive: true, createdAt: true,
    },
  });
  if (!user) throw new NotFoundException('User not found');
  return user;
}

async updateMe(userId: string, orgId: string, dto: UpdateMeDto) {
  const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  if (!user) throw new NotFoundException('User not found');

  const { email, currentPassword, ...rest } = dto;
  const updateData: Record<string, unknown> = { ...rest };

  if (email) {
    if (!currentPassword) throw new BadRequestException('กรุณายืนยันรหัสผ่านก่อนเปลี่ยน email');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');
    updateData.email = email;
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: updateData as any,
    select: { id: true, email: true, displayName: true, phone: true, gender: true, avatarUrl: true, role: true },
  });
}

async changePassword(userId: string, orgId: string, currentPassword: string, newPassword: string) {
  const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  if (!user) throw new NotFoundException('User not found');
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedException('รหัสผ่านไม่ถูกต้อง');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

async unlinkLine(userId: string, orgId: string) {
  await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  await this.prisma.user.update({ where: { id: userId }, data: { lineUserId: null } });
}

async saveAvatarUrl(userId: string, orgId: string, avatarUrl: string) {
  return this.prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: { id: true, avatarUrl: true },
  });
}
```

Also add these imports at the top of `auth.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
```
(Replace the existing `Injectable, UnauthorizedException, ConflictException` import line.)

Import `UpdateMeDto` at the top:
```typescript
import { UpdateMeDto } from './dto/update-me.dto';
```

- [ ] **Step 5: Run tests**

```bash
cd apps/backend && npx jest src/modules/auth/test/auth-me --no-coverage 2>&1 | tail -6
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/
git commit -m "feat: AuthService — getMe, updateMe, changePassword, unlinkLine, saveAvatarUrl (TDD)"
```

---

## Task 3: Auth controller — wire me routes + file upload + ServeStaticModule

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Install @nestjs/serve-static**

```bash
cd apps/backend && npm install @nestjs/serve-static
```

Expected: added to `package.json`.

- [ ] **Step 2: Create uploads directory**

```bash
mkdir -p apps/backend/uploads/avatars
touch apps/backend/uploads/avatars/.gitkeep
echo "uploads/" >> apps/backend/.gitignore
```

- [ ] **Step 3: Add ServeStaticModule to app.module.ts**

Open `apps/backend/src/app.module.ts`. Add import:
```typescript
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
```

Add to the `imports` array (after `PrismaModule`):
```typescript
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', '..', 'uploads'),
  serveRoot: '/uploads',
}),
```

- [ ] **Step 4: Add me routes to auth controller**

Replace the entire content of `apps/backend/src/modules/auth/auth.controller.ts`:

```typescript
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Patch, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { Res, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const avatarStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'avatars'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // ── Public auth ────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { ttl: 900000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, role } = await this.auth.login(dto.email, dto.password);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string = req.cookies?.[COOKIE_NAME] ?? '';
    const { accessToken, refreshToken, role } = await this.auth.refresh(token);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async logout(@Res({ passthrough: true }) res: Response, @Body('refreshToken') bodyToken?: string) {
    await this.auth.logout(bodyToken ?? '');
    res.clearCookie(COOKIE_NAME);
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  setup(@Body() dto: SetupDto) {
    return this.auth.setup(dto.orgName, dto.adminName, dto.adminEmail, dto.adminPassword);
  }

  @Post('liff/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  liffVerify(@Body('idToken') idToken: string) {
    if (!idToken) throw new BadRequestException('idToken is required');
    return this.auth.verifyLiffToken(idToken);
  }

  // ── Profile (me) ───────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.auth.getMe(user.sub, user.orgId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: JwtPayload) {
    return this.auth.updateMe(user.sub, user.orgId, dto);
  }

  @Post('me/change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtPayload) {
    return this.auth.changePassword(user.sub, user.orgId, dto.currentPassword, dto.newPassword);
  }

  @Delete('me/line')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkLine(@CurrentUser() user: JwtPayload) {
    return this.auth.unlinkLine(user.sub, user.orgId);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', {
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('ไฟล์ต้องเป็น jpg/png/webp และไม่เกิน 2MB'), false);
    },
  }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.auth.saveAvatarUrl(user.sub, user.orgId, avatarUrl);
  }
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Smoke-test endpoints**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.th","password":"Admin1234!"}' | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).accessToken)")

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/auth/me | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const u=JSON.parse(d);console.log(u.email, u.role, 'phone:', u.phone, 'gender:', u.gender)"
```

Expected: `admin@hospital.th ADMIN phone: null gender: null`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/auth/ apps/backend/src/app.module.ts apps/backend/uploads/ apps/backend/.gitignore
git commit -m "feat: GET/PATCH /auth/me + change-password + unlink-line + avatar upload"
```

---

## Task 4: Users module — SUPER_ADMIN CRUD with DTOs (TDD)

**Files:**
- Create: `apps/backend/src/modules/users/dto/create-user.dto.ts`
- Create: `apps/backend/src/modules/users/dto/update-user.dto.ts`
- Create: `apps/backend/src/modules/users/test/users.service.spec.ts`
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/backend/src/modules/users/dto/create-user.dto.ts`:
```typescript
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole, Gender } from '@prisma/client';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() displayName: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
}
```

Create `apps/backend/src/modules/users/dto/update-user.dto.ts`:
```typescript
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole, Gender } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/backend/src/modules/users/test/users.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('hashes password and saves user', async () => {
      mockPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'new@b.com', displayName: 'New', role: 'CASE_MANAGER', createdAt: new Date() });
      const result = await service.create({
        email: 'new@b.com', displayName: 'New', password: 'Passw0rd!', role: 'CASE_MANAGER' as any, orgId: 'org1',
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@b.com', passwordHash: expect.any(String) }),
        }),
      );
      expect(result.email).toBe('new@b.com');
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', organizationId: 'org1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u2', isActive: false });
      await service.deactivate('u2', 'org1', 'u1-actor');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('throws BadRequestException when deactivating own account', async () => {
      await expect(service.deactivate('u1', 'org1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('throws when SA tries to change their own role', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', organizationId: 'org1' });
      await expect(
        service.update('u1', 'org1', 'u1', { role: 'CASE_MANAGER' as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 3: Run to confirm all fail**

```bash
cd apps/backend && npx jest src/modules/users/test --no-coverage 2>&1 | tail -6
```

Expected: FAIL.

- [ ] **Step 4: Rewrite users.service.ts**

Replace the entire content of `apps/backend/src/modules/users/users.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

const USER_SELECT = {
  id: true, email: true, displayName: true, role: true,
  phone: true, gender: true, avatarUrl: true,
  isActive: true, lineUserId: true, createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: CreateUserDto & { orgId: string }) {
    const passwordHash = await bcrypt.hash(data.password, 12);
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        role: data.role,
        phone: data.phone,
        gender: data.gender,
        organizationId: data.orgId,
      },
      select: USER_SELECT,
    });
  }

  async update(id: string, orgId: string, actorId: string, dto: UpdateUserDto) {
    await this.findOne(id, orgId);
    if (dto.role !== undefined && id === actorId) {
      throw new BadRequestException('ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: USER_SELECT,
    });
  }

  async deactivate(id: string, orgId: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('ไม่สามารถปิดบัญชีของตนเองได้');
    await this.findOne(id, orgId);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }
}
```

- [ ] **Step 5: Rewrite users.controller.ts**

Replace the entire content of `apps/backend/src/modules/users/users.controller.ts`:

```typescript
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.users.findAll(user.orgId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.create({ ...dto, orgId: user.orgId });
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.users.update(id, user.orgId, user.sub, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.users.deactivate(id, user.orgId, user.sub);
  }
}
```

- [ ] **Step 6: Run tests + TypeScript check**

```bash
cd apps/backend && npx jest src/modules/users/test --no-coverage 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | head -5
```

Expected: all tests pass, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/users/
git commit -m "feat: UsersService/Controller — SA CRUD + phone/gender/avatarUrl + deactivate (TDD)"
```

---

## Task 5: Fix NextAuth session — pass displayName + avatarUrl

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.service.ts` (issueTokens)
- Modify: `apps/frontend/src/lib/auth.config.ts`

- [ ] **Step 1: Add displayName + avatarUrl to JWT token in issueTokens**

In `apps/backend/src/modules/auth/auth.service.ts`, update the `issueTokens` method signature and payload:

```typescript
private async issueTokens(userId: string, email: string, role: string, orgId: string, displayName: string, avatarUrl: string | null) {
  const accessToken = await this.jwt.signAsync(
    { sub: userId, email, role, orgId, displayName, avatarUrl },
    { expiresIn: this.config.get('jwt.expiresIn') },
  );
  // ... rest unchanged
```

Update the `login` call to `issueTokens`:
```typescript
return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
```

Update the `refresh` call to `issueTokens`:
```typescript
return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
```

- [ ] **Step 2: Update JWT strategy to pass displayName + avatarUrl**

Open `apps/backend/src/modules/auth/strategies/jwt.strategy.ts`. Update the `validate` return to include `displayName` and `avatarUrl`:

```typescript
validate(payload: any) {
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    orgId: payload.orgId,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
  };
}
```

Also update `JwtPayload` interface in `apps/backend/src/common/decorators/current-user.decorator.ts`:
```typescript
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  orgId: string;
  displayName?: string;
  avatarUrl?: string;
}
```

- [ ] **Step 3: Update auth.config.ts in frontend**

Replace the callbacks section of `apps/frontend/src/lib/auth.config.ts`:

```typescript
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.accessToken = user.accessToken;
      token.refreshToken = (user as any).refreshToken;
      token.role = user.role;
      token.displayName = (user as any).displayName;
      token.avatarUrl = (user as any).avatarUrl ?? null;
    }
    return token;
  },
  async session({ session, token }) {
    session.accessToken = token.accessToken;
    session.role = token.role;
    session.displayName = token.displayName as string | undefined;
    session.avatarUrl = token.avatarUrl as string | null | undefined;
    return session;
  },
},
```

- [ ] **Step 4: Fix Sidebar to use real displayName**

In `apps/frontend/src/components/layout/Sidebar.tsx`, update:
```typescript
const userName: string = (session as any)?.displayName ?? (session as any)?.user?.name ?? 'ผู้ใช้งาน';
```

And update the hardcoded role text:
```typescript
<Text style={{ fontSize: 10, color: '#bbb' }}>
  {role || 'USER'}
</Text>
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
cd apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/ apps/frontend/src/lib/auth.config.ts apps/frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: pass displayName + avatarUrl through JWT token → NextAuth session → Sidebar"
```

---

## Task 6: Frontend — /profile page

**Files:**
- Create: `apps/frontend/src/app/(app)/profile/page.tsx`

- [ ] **Step 1: Create the profile page**

Create `apps/frontend/src/app/(app)/profile/page.tsx`:

```tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import {
  App, Avatar, Button, Card, Form, Input, Modal,
  Radio, Space, Tag, Typography, Upload,
} from 'antd';
import { CameraOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface MeData {
  id: string; email: string; displayName: string; role: string;
  phone: string | null; gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  avatarUrl: string | null; lineUserId: string | null; createdAt: string;
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const { message, modal } = App.useApp();
  const [me, setMe] = useState<MeData | null>(null);
  const [infoForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmPwOpen, setConfirmPwOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [confirmPwVal, setConfirmPwVal] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = (session as any)?.accessToken ?? '';
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: headers() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMe(d);
          infoForm.setFieldsValue({ displayName: d.displayName, email: d.email, phone: d.phone ?? '', gender: d.gender });
        }
      });
  }, [token, headers, infoForm]);

  async function handleSaveInfo(values: any) {
    if (values.email && values.email !== me?.email) {
      setPendingEmail(values.email);
      setConfirmPwOpen(true);
      return;
    }
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ displayName: values.displayName, phone: values.phone || null, gender: values.gender ?? null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMe(prev => prev ? { ...prev, ...updated } : prev);
        await update({ displayName: updated.displayName });
        message.success('บันทึกข้อมูลแล้ว');
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingInfo(false); }
  }

  async function handleEmailChange() {
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ email: pendingEmail, currentPassword: confirmPwVal }),
      });
      if (res.ok) {
        message.success('เปลี่ยน email แล้ว กรุณา login ใหม่');
        setConfirmPwOpen(false);
        await signOut({ callbackUrl: '/login' });
      } else {
        const err = await res.json();
        message.error(err.message ?? 'รหัสผ่านไม่ถูกต้อง');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingInfo(false); }
  }

  async function handleChangePassword(values: any) {
    if (values.newPassword !== values.confirmPassword) {
      message.error('รหัสผ่านใหม่ไม่ตรงกัน'); return;
    }
    setSavingPw(true);
    try {
      const res = await fetch(`${API}/auth/me/change-password`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      if (res.ok) { message.success('เปลี่ยนรหัสผ่านแล้ว'); pwForm.resetFields(); }
      else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingPw(false); }
  }

  async function handleUnlinkLine() {
    modal.confirm({
      title: 'ยกเลิกการเชื่อมต่อ LINE?',
      content: 'คุณจะไม่สามารถรับการแจ้งเตือนผ่าน LINE ได้',
      okText: 'ยืนยัน', cancelText: 'ยกเลิก', okButtonProps: { danger: true },
      onOk: async () => {
        setUnlinking(true);
        try {
          const res = await fetch(`${API}/auth/me/line`, { method: 'DELETE', headers: headers() });
          if (res.ok) { setMe(prev => prev ? { ...prev, lineUserId: null } : prev); message.success('ยกเลิกการเชื่อมต่อ LINE แล้ว'); }
          else message.error('เกิดข้อผิดพลาด');
        } catch { message.error('เกิดข้อผิดพลาด'); }
        finally { setUnlinking(false); }
      },
    });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      const res = await fetch(`${API}/auth/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const { avatarUrl } = await res.json();
        setMe(prev => prev ? { ...prev, avatarUrl } : prev);
        message.success('อัปเดตรูปโปรไฟล์แล้ว');
      } else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const initials = me?.displayName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '??';
  const roleLabel: Record<string, string> = { ADMIN: 'ผู้ดูแลระบบ', SUPER_ADMIN: 'ผู้อำนวยการ', CASE_MANAGER: 'เคสแมเนเจอร์', FIELD_WORKER: 'อาสาสมัคร', MEDICAL_VOLUNTEER: 'อาสาพยาบาล' };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Account</div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>โปรไฟล์ของฉัน</Title>
      </div>

      {/* Avatar + role header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
            <Avatar
              size={64}
              src={me?.avatarUrl ? `${API}${me.avatarUrl}` : undefined}
              style={{ background: '#1677ff', fontSize: 22, fontWeight: 700 }}
            >
              {initials}
            </Avatar>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, background: '#fff', borderRadius: '50%', border: '1px solid #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
              <CameraOutlined style={{ fontSize: 11 }} />
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{me?.displayName}</div>
            <Tag color="blue" style={{ marginTop: 4 }}>{me?.role ? (roleLabel[me.role] ?? me.role) : '…'}</Tag>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              เข้าร่วม {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '…'}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal info */}
      <Card title={<span style={{ color: '#1677ff', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>ข้อมูลส่วนตัว</span>} style={{ marginBottom: 16 }}>
        <Form form={infoForm} layout="vertical" onFinish={handleSaveInfo}>
          <Form.Item name="displayName" label="ชื่อแสดง" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={<span>อีเมล <Text type="secondary" style={{ fontSize: 11 }}>(เปลี่ยนแล้วจะออกจากระบบอัตโนมัติ)</Text></span>}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="เบอร์โทรศัพท์">
            <Input placeholder="0812345678" />
          </Form.Item>
          <Form.Item name="gender" label="เพศ">
            <Radio.Group>
              <Radio.Button value="MALE">ชาย</Radio.Button>
              <Radio.Button value="FEMALE">หญิง</Radio.Button>
              <Radio.Button value="OTHER">อื่นๆ</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingInfo} block>บันทึกข้อมูล</Button>
        </Form>
      </Card>

      {/* Change password */}
      <Card title={<span style={{ color: '#faad14', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>เปลี่ยนรหัสผ่าน</span>} style={{ marginBottom: 16 }}>
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="currentPassword" label="รหัสผ่านเดิม" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="รหัสผ่านใหม่" rules={[{ required: true }, { min: 8, message: 'อย่างน้อย 8 ตัว' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="ยืนยันรหัสผ่านใหม่" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingPw} style={{ background: '#faad14', borderColor: '#faad14' }} block>
            เปลี่ยนรหัสผ่าน
          </Button>
        </Form>
      </Card>

      {/* LINE */}
      <Card title={<span style={{ color: '#06c755', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>LINE Account</span>}>
        {me?.lineUserId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text style={{ color: '#06c755', fontWeight: 600 }}>● เชื่อมต่อแล้ว</Text>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{me.lineUserId.slice(0, 20)}...</div>
            </div>
            <Button danger size="small" loading={unlinking} onClick={handleUnlinkLine}>Unlink</Button>
          </div>
        ) : (
          <Text type="secondary">ยังไม่เชื่อมต่อ LINE</Text>
        )}
      </Card>

      {/* Email change confirm modal */}
      <Modal
        title="ยืนยันรหัสผ่านก่อนเปลี่ยน Email"
        open={confirmPwOpen}
        onCancel={() => setConfirmPwOpen(false)}
        onOk={handleEmailChange}
        okText="ยืนยันและเปลี่ยน Email"
        confirmLoading={savingInfo}
      >
        <Text type="warning" style={{ display: 'block', marginBottom: 12 }}>
          หลังเปลี่ยน email คุณจะถูก logout อัตโนมัติ
        </Text>
        <Input.Password
          placeholder="รหัสผ่านปัจจุบัน"
          value={confirmPwVal}
          onChange={e => setConfirmPwVal(e.target.value)}
        />
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/profile/
git commit -m "feat(ui): /profile page — avatar, displayName, email, phone, gender, password, LINE unlink"
```

---

## Task 7: Frontend — /users page (SUPER_ADMIN)

**Files:**
- Create: `apps/frontend/src/app/(app)/users/page.tsx`

- [ ] **Step 1: Create the users management page**

Create `apps/frontend/src/app/(app)/users/page.tsx`:

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  App, Avatar, Button, Card, Drawer, Form, Input,
  Popconfirm, Select, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface UserRow {
  id: string; email: string; displayName: string; role: string;
  phone: string | null; gender: string | null;
  avatarUrl: string | null; isActive: boolean; createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
  { value: 'CASE_MANAGER', label: 'CASE_MANAGER' },
  { value: 'FIELD_WORKER', label: 'FIELD_WORKER' },
  { value: 'MEDICAL_VOLUNTEER', label: 'MEDICAL_VOLUNTEER' },
];

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'ชาย' },
  { value: 'FEMALE', label: 'หญิง' },
  { value: 'OTHER', label: 'อื่นๆ' },
];

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: 'purple', ADMIN: 'blue', CASE_MANAGER: 'green',
  FIELD_WORKER: 'orange', MEDICAL_VOLUNTEER: 'cyan',
};

export default function UsersPage() {
  const { data: session } = useSession();
  const { message } = App.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const token = (session as any)?.accessToken ?? '';
  const myId = (session as any)?.sub ?? '';
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API}/users`, { headers: headers() })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, headers]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    form.setFieldsValue({ displayName: user.displayName, email: user.email, role: user.role, phone: user.phone ?? '', gender: user.gender });
    setDrawerOpen(true);
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const url = editing ? `${API}/users/${editing.id}` : `${API}/users`;
      const method = editing ? 'PATCH' : 'POST';
      const body = editing
        ? { displayName: values.displayName, phone: values.phone || null, gender: values.gender ?? null, role: values.role }
        : { ...values, phone: values.phone || null, gender: values.gender ?? null };
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      if (res.ok) {
        message.success(editing ? 'อัปเดตแล้ว' : 'สร้าง user แล้ว');
        setDrawerOpen(false); load();
      } else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    try {
      const res = await fetch(`${API}/users/${id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) { message.success('ปิดบัญชีแล้ว'); load(); }
      else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
  }

  const columns: ColumnsType<UserRow> = [
    {
      title: 'ผู้ใช้งาน', key: 'user',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={32} src={r.avatarUrl ? `${API}${r.avatarUrl}` : undefined} style={{ background: '#1677ff', fontSize: 12 }}>
            {r.displayName.slice(0, 2).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.displayName}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{r.email}</div>
          </div>
        </div>
      ),
    },
    { title: 'เบอร์โทร', dataIndex: 'phone', key: 'phone', width: 120, render: v => v ?? <span style={{ color: '#d9d9d9' }}>—</span> },
    {
      title: 'สิทธิ์', dataIndex: 'role', key: 'role', width: 140,
      render: role => <Tag color={ROLE_COLOR[role] ?? 'default'}>{role}</Tag>,
    },
    {
      title: 'สถานะ', dataIndex: 'isActive', key: 'isActive', width: 90,
      render: v => <span style={{ color: v ? '#52c41a' : '#aaa' }}>{v ? '● ใช้งาน' : '○ ปิด'}</span>,
    },
    {
      title: '', key: 'actions', width: 100,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => openEdit(r)}>✏️</Button>
          {r.id !== myId && r.isActive && (
            <Popconfirm title="ปิดบัญชีนี้?" okText="ยืนยัน" cancelText="ยกเลิก" okButtonProps={{ danger: true }} onConfirm={() => handleDeactivate(r.id)}>
              <Button size="small" danger>🗑</Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: '#722ed1', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Users</div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>จัดการผู้ใช้งาน</Title>
        </div>
        <Button type="primary" style={{ background: '#722ed1', borderColor: '#722ed1' }} onClick={openCreate}>+ เพิ่ม User</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} size="middle" pagination={{ pageSize: 20 }} />
      </Card>

      <Drawer
        title={editing ? `แก้ไข: ${editing.displayName}` : 'เพิ่ม User ใหม่'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ wrapper: { width: 420 } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="displayName" label="ชื่อแสดง" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true }, { min: 8, message: 'อย่างน้อย 8 ตัว' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="role" label="สิทธิ์" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="phone" label="เบอร์โทรศัพท์">
            <Input placeholder="0812345678" />
          </Form.Item>
          <Form.Item name="gender" label="เพศ">
            <Select options={GENDER_OPTIONS} allowClear placeholder="ไม่ระบุ" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            {editing ? 'บันทึก' : 'สร้าง User'}
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/users/
git commit -m "feat(ui): /users page — SA user management table + create/edit Drawer + deactivate"
```

---

## Task 8: Sidebar nav + Docker Compose volume

**Files:**
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add nav items to Sidebar**

Open `apps/frontend/src/components/layout/Sidebar.tsx`.

Update the lucide-react import to add `UserCircle`:
```tsx
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, Package, UserCircle } from 'lucide-react';
```

Update `navItems` to add `ผู้ใช้งาน` (SUPER_ADMIN only) and `โปรไฟล์` (all roles):
```tsx
const navItems: MenuProps['items'] = [
  { key: '/dashboard', label: 'Dashboard',      icon: <LayoutDashboard size={ICON_SIZE} /> },
  { key: '/patients',  label: 'ผู้ป่วย',        icon: <Users size={ICON_SIZE} /> },
  { key: '/events',    label: 'แผนการเยี่ยม',   icon: <CalendarDays size={ICON_SIZE} /> },
  { key: '/forms',     label: 'แบบฟอร์ม',       icon: <FileText size={ICON_SIZE} /> },
  ...(role === 'ADMIN' || role === 'SUPER_ADMIN'
    ? [{ key: '/inventory', label: 'คลังยา', icon: <Package size={ICON_SIZE} /> }]
    : []),
  ...(role === 'SUPER_ADMIN'
    ? [{ key: '/users', label: 'ผู้ใช้งาน', icon: <Users size={ICON_SIZE} /> }]
    : []),
];
```

Add a Profile link in the user footer section, just above the logout button. Replace the footer `<div>` content:
```tsx
<div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
  <div
    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}
    onClick={() => router.push('/profile')}
  >
    <Avatar size={28} style={{ background: '#1677ff', fontSize: 11, fontWeight: 700 }}>
      {initials}
    </Avatar>
    <div style={{ minWidth: 0, flex: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
        {userName}
      </Text>
      <Text style={{ fontSize: 10, color: '#bbb' }}>
        {role || 'USER'}
      </Text>
    </div>
    <UserCircle size={14} style={{ color: '#bbb', flexShrink: 0 }} />
  </div>
  <Button
    block size="small"
    icon={<LogOut size={12} />}
    onClick={() => signOut({ callbackUrl: '/login' })}
    style={{ fontSize: 12 }}
  >
    ออกจากระบบ
  </Button>
</div>
```

- [ ] **Step 2: Add uploads volume to docker-compose.yml**

Open `docker-compose.yml`. Under the `backend` service, add:
```yaml
    volumes:
      - uploads:/app/apps/backend/uploads
```

Under the top-level `volumes:` section, add:
```yaml
  uploads:
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
cd apps/frontend && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/Sidebar.tsx docker-compose.yml
git commit -m "feat(ui): Sidebar — โปรไฟล์ link + ผู้ใช้งาน SA nav + Docker uploads volume"
```

---

## Self-Review

**Spec coverage:**
- ✅ `phone`, `gender`, `avatarUrl` added to User model — Task 1
- ✅ `GET /auth/me` returning all new fields — Task 2 + 3
- ✅ `PATCH /auth/me` with email-change confirm flow — Task 2 + 3
- ✅ `POST /auth/me/change-password` — Task 2 + 3
- ✅ `DELETE /auth/me/line` — Task 2 + 3
- ✅ `POST /auth/me/avatar` (2MB, jpg/png/webp, ServeStatic) — Task 3
- ✅ SA CRUD `/users` with phone/gender, SUPER_ADMIN guard, self-deactivate/role guard — Task 4
- ✅ displayName + avatarUrl in JWT → session → Sidebar — Task 5
- ✅ `/profile` page — all 3 sections (info, password, LINE) — Task 6
- ✅ `/users` page — table + Drawer + deactivate — Task 7
- ✅ Sidebar `โปรไฟล์` + `ผู้ใช้งาน` nav items — Task 8
- ✅ Docker Compose uploads volume — Task 8
- ✅ Error messages (wrong password, self-deactivate, self-role-change) — Tasks 2 + 4

**Type consistency:**
- `USER_SELECT` const defined once in `users.service.ts`, used in all queries ✅
- `UpdateMeDto` imported in both service and controller ✅
- `JwtPayload.displayName` / `avatarUrl` optional — consistent with Task 5 additions ✅
- `avatarUrl` stored as `/uploads/avatars/<filename>` — frontend prepends `${API}` for full URL ✅
