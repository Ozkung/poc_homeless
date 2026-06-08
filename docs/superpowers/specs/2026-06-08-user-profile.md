# User Profile & User Management Spec

**Date:** 2026-06-08
**Scope:** Self-service profile page for all users (`/profile`) + SUPER_ADMIN user management page (`/users`)

---

## Overview

Two new frontend pages backed by new backend endpoints:

1. **`/profile`** — every authenticated user can view and edit their own profile: display name, email, phone, gender, avatar, password, and LINE account status.
2. **`/users`** — SUPER_ADMIN only; full CRUD over users in the same organisation, including role assignment and account activation/deactivation.

---

## Schema Changes

Add two nullable fields to `model User` in `prisma/schema.prisma`:

```prisma
phone  String?
gender Gender?   // reuses existing Gender enum (MALE | FEMALE | OTHER)
```

Email is already on the model. `avatarUrl` is stored as a relative path string after upload:

```prisma
avatarUrl String?
```

Migration name: `add-user-profile-fields`

---

## Backend

### Module: `auth` (extend existing)

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/auth/me` | JWT | Return current user (id, email, displayName, phone, gender, role, lineUserId, avatarUrl, createdAt) |
| PATCH | `/auth/me` | JWT | Update displayName, phone, gender. If `email` is included, require `currentPassword` field — verify it, update email, then the frontend signs out. |
| POST | `/auth/me/change-password` | JWT | Body: `{ currentPassword, newPassword }`. Verify old, bcrypt new, save. Min 8 chars enforced by DTO. |
| DELETE | `/auth/me/line` | JWT | Set `lineUserId = null` on the current user. |
| POST | `/auth/me/avatar` | JWT | `multipart/form-data`, field `avatar`. Accept jpg/png/webp ≤ 2 MB. Save to `apps/backend/uploads/avatars/<uuid>.<ext>`, update `avatarUrl`. |

Static file serving: mount `apps/backend/uploads` as a static directory at `/uploads` via `ServeStaticModule`. Docker Compose adds a named volume `uploads` mapped to `/app/apps/backend/uploads`.

### Module: `users` (new)

Guard: `JwtAuthGuard + RolesGuard`, all routes require `SUPER_ADMIN`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users in `req.user.orgId`. Returns id, email, displayName, phone, gender, role, isActive, avatarUrl, createdAt. |
| POST | `/users` | Create user. Body: `{ email, displayName, password, role, phone?, gender? }`. bcrypt password. |
| PATCH | `/users/:id` | Update displayName, phone, gender, role, isActive. Cannot change own role. |
| DELETE | `/users/:id` | Soft-delete: set `isActive = false`. Cannot deactivate own account. |

### DTOs

- `UpdateMeDto` — all optional: `displayName?`, `email?`, `currentPassword?` (required if email changes), `phone?`, `gender?`
- `ChangePasswordDto` — `currentPassword`, `newPassword` (min 8)
- `CreateUserDto` — `email`, `displayName`, `password`, `role`, `phone?`, `gender?`
- `UpdateUserDto` — all optional: `displayName?`, `phone?`, `gender?`, `role?`, `isActive?`

---

## Frontend

### `/profile` page (`apps/frontend/src/app/(app)/profile/page.tsx`)

Client component. Layout: centered max-width card with 3 collapsible antd `Card` sections.

**Section 1 — ข้อมูลส่วนตัว**
- Avatar: circular image (or initials fallback). Pencil icon overlay triggers hidden `<input type="file">` → POST `/auth/me/avatar`.
- Fields: ชื่อแสดง (required), อีเมล (editable — shows warning banner "เปลี่ยน email จะออกจากระบบอัตโนมัติ"), เบอร์โทรศัพท์, เพศ (Radio: ชาย/หญิง/อื่นๆ).
- If email is changed, show a confirm-password Modal before saving; on success call `signOut()`.
- Submit: PATCH `/auth/me`.

**Section 2 — เปลี่ยนรหัสผ่าน**
- Fields: รหัสผ่านเดิม, รหัสผ่านใหม่, ยืนยันรหัสผ่านใหม่.
- Client-side: validate new === confirm before submit.
- Submit: POST `/auth/me/change-password`.

**Section 3 — LINE Account**
- If `lineUserId` is set: show green "เชื่อมต่อแล้ว" badge + masked ID + Unlink button → DELETE `/auth/me/line`.
- If not set: show grey "ยังไม่เชื่อมต่อ" (no action — linking requires LIFF flow, out of scope).

**Sidebar link:** Add a "โปรไฟล์" item for all roles that routes to `/profile`. Place above the logout button.

**Session refresh after PATCH:** After a successful save, call `update()` from `useSession()` to refresh the session token so the Sidebar shows the updated name.

### `/users` page (`apps/frontend/src/app/(app)/users/page.tsx`)

Client component. Visible only to `SUPER_ADMIN` (both Sidebar item and server-side layout guard).

- **Table**: columns — Avatar+Name, Email, Role (tag), Status (active/inactive), Actions.
- **Add button** → opens a right-side Drawer with `CreateUserDto` fields: email, displayName, password, role (Select), phone, gender.
- **Edit (✏️)** → same Drawer pre-filled, password field hidden (separate change-password not in scope for SA).
- **Deactivate (🗑)** → confirm Modal → PATCH `isActive: false`. Disabled if row is the current user.
- **Sidebar item**: "ผู้ใช้งาน" with `Users` icon, visible only to `SUPER_ADMIN`.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Wrong `currentPassword` on email change or password change | 401 + "รหัสผ่านไม่ถูกต้อง" |
| Email already taken | 409 + "อีเมลนี้ถูกใช้งานแล้ว" |
| Avatar > 2 MB or wrong type | 400 + "ไฟล์ต้องเป็น jpg/png/webp และไม่เกิน 2MB" |
| SA tries to deactivate own account | 400 + "ไม่สามารถปิดบัญชีของตนเองได้" |
| SA tries to change own role | 400 + "ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้" |

---

## Sidebar Updates

```
Dashboard
ผู้ป่วย
แผนการเยี่ยม
แบบฟอร์ม
คลังยา          ← ADMIN / SUPER_ADMIN only (existing)
ผู้ใช้งาน        ← SUPER_ADMIN only (new)
─────────────────
โปรไฟล์          ← all roles (new, above logout)
ออกจากระบบ
```

---

## Docker Compose

Add to `docker-compose.yml` under `backend`:
```yaml
volumes:
  - uploads:/app/apps/backend/uploads
```

Add to top-level `volumes`:
```yaml
uploads:
```

---

## Out of Scope

- Email verification flow (email change takes effect immediately)
- LINE account linking (requires LIFF — only unlink is implemented)
- Password reset via email
- Organisation-level settings
