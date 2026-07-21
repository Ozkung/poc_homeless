# HomeMed Connect

ระบบดูแลผู้ป่วยไร้บ้านในชุมชน — Case Manager Platform

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2 + App Router + NextAuth.js + Tailwind |
| Backend | NestJS + Prisma ORM + Bull Queue |
| Database | PostgreSQL 15 + Redis 7 |
| Mobile | Line OA + Line LIFF (Vite + React) |
| Infra | Docker Compose + Nginx |

## Monorepo Structure

```
apps/
  backend/   — NestJS API (port 3001)
  frontend/  — Next.js CM Dashboard (port 3000)
  liff/      — Line LIFF Field Worker App (port 5173)
packages/
  shared-types/  — Shared TypeScript interfaces (FormField, Patient, Task)
```

## Quick Start

```bash
cp .env.example .env
# edit .env

docker compose up postgres redis -d
npm install
cd apps/backend && npx prisma migrate dev && cd ../..
npm run dev
```

## Security

- OWASP Top 10 compliant
- AES-256-GCM encryption for all PII
- Single-use LIFF tokens (Redis GETDEL)
- JWT 15min + 7day rotating refresh
- Bcrypt cost=12, Helmet.js, audit logging

docker compose exec backend_hl npm run db:seed