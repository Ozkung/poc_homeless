# Open API Access Request — Design

## Context

External parties (partner organizations, integrators) sometimes need programmatic access to
this system's data. Today there is no way to request, grant, or manage that access — no public
request intake, no API token concept separate from user login sessions, and no email-sending
capability in this codebase at all. This design builds the **request → SuperAdmin review →
token issuance → email notification** workflow.

**Explicitly out of scope for this phase** (confirmed with the user):
- The actual external-facing data API endpoints that a token would be used to call (e.g.
  `GET /external/patients`). This phase only builds the request/approval/token workflow. A
  follow-up project designs and builds the real endpoints plus the guard that checks a Bearer
  token against `ApiAccessToken` and enforces `grantedLevel`/`grantedScope` on live data.
- Real Swagger/OpenAPI documentation generation and hosting. The approval email includes a
  `SWAGGER_DOCS_URL` link placeholder for wherever that ends up being hosted later.
- A requester-facing request-status-lookup page. Email is the only channel back to the
  requester (both approval and rejection send an email), so a separate status page is
  redundant for this phase.

## User flow

1. An external party visits a public, unauthenticated page and submits a request: name,
   organization (optional), email, phone, a justification file (PDF/DOC/DOCX), a usage level
   (**View** or **Create+Update** — one level for the whole request, not per-entity), and a
   checkbox tree of which entities/columns they want access to.
2. The request is stored with status `PENDING` and appears in a SuperAdmin-only queue.
3. SuperAdmin opens a request: sees requester info, the justification file, and the requested
   level/columns as a pre-checked but editable checkbox tree (SuperAdmin can narrow the granted
   scope before approving — approving is not required to match the request verbatim).
4. **Approve**: the system generates an opaque token, stores only its hash, saves the granted
   scope on the token record, and automatically emails the requester the plaintext token (shown
   this one time), a Swagger docs link, and a link to the static PDF manual. The SuperAdmin's UI
   also displays the token once, as a backup record in case the email fails to send or is lost.
5. **Reject**: the system emails the requester a rejection notice with an optional reason. No
   token is created.
6. A separate token-management screen lists all issued tokens (requester, granted scope
   summary, status, issued date). SuperAdmin can revoke any token at any time — an instant
   on/off action, not a scheduled expiry date.

## Data model

Two new Prisma models plus supporting enums, added to
`apps/backend/prisma/schema.prisma`:

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
  reviewer              User?                   @relation(fields: [reviewedById], references: [id])
  reviewedAt            DateTime?
  token                 ApiAccessToken?
  createdAt             DateTime                @default(now())
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

Notes:
- `requestedScope`/`grantedScope` are JSON shaped as `{ "Patient": ["hn","age","gender"],
  "Diagnosis": ["title","severity"], ... }` — a map of entity name to selected column names.
  This is stored as JSON rather than a join table because the entity/column list is a fixed,
  code-defined catalog (see below), not user-editable data; JSON avoids a schema migration
  every time the catalog gains a field.
- The plaintext token is never persisted — only a SHA-256 `tokenHash`, matching how this
  codebase already treats other sensitive secrets (e.g. refresh tokens in Redis).
- No `expiresAt` field: expiry is a manual on/off action (`isRevoked` + `revokedAt`), not a
  scheduled date, per the confirmed requirement.

## The entity/column catalog

A fixed catalog of which entities and columns are selectable lives as a plain TypeScript const:
`apps/backend/src/modules/api-access/column-catalog.ts`. It covers the six entities confirmed
with the user, each mapped to its underlying Prisma model:

| Catalog entity        | Prisma model                          | Example selectable fields |
|------------------------|----------------------------------------|----------------------------|
| Patient                | `Patient`                              | `hn`, `age`, `gender`, `status`, `conditions`, `phone`, `photoUrl` (decrypted PII like name is listed by its logical name, not its `*Enc` storage column) |
| Diagnosis               | `Diagnosis`                            | `title`, `severity`, `createdAt`, `doctorId` |
| Prescription            | `Prescription`                         | `medications`, `createdAt`, `doctorId` |
| Care Plan / Activity    | `CarePlanItem` and `Activity`          | `CarePlanItem`: `title`, `status`, `dueDate`; `Activity`: `type`, `payload`, `createdAt` |
| Doctor Schedule         | `DoctorSchedule`                       | `date`, `startTime`, `endTime`, `zoneId`, `doctorId` |
| Care Giver (list)       | `User` filtered to `role: CARE_GIVER`  | `displayName`, `phone`, `email`, `zoneId` |

Each catalog entry lists its selectable field names explicitly (the table above is illustrative,
not exhaustive — the implementation task enumerates the full field list per model).

This catalog is the single source of truth: both the public request form and the SuperAdmin
approval screen render their checkbox trees from the same
`GET /api-access-requests/catalog` response, so the two screens can never drift out of sync.
Adding a selectable column later is a one-line change to this file, not a migration.

## Backend API surface

New module: `apps/backend/src/modules/api-access/`.

**Public (no auth), rate-limited by IP:**
- `POST /api-access-requests` — multipart form (justification file + fields). Creates a
  `PENDING` request. Returns a bare success confirmation, no sensitive data.
- `GET /api-access-requests/catalog` — returns the entity/column catalog for rendering the
  checkbox tree.

Rate limiting reuses the existing `@nestjs/throttler` dependency (already installed, used
elsewhere in this app) via `@Throttle()` on the `POST` handler — e.g. 3 requests per IP per
hour. No new dependency or infrastructure required.

**SuperAdmin-only** (existing `JwtAuthGuard` + `RolesGuard`, `@Roles(UserRole.SUPER_ADMIN)`):
- `GET /api-access-requests` — list all requests, filterable by status.
- `GET /api-access-requests/:id` — one request's full detail, including access to the uploaded
  justification file.
- `PATCH /api-access-requests/:id/approve` — body `{ grantedLevel, grantedScope }` (defaults to
  the request's own values if SuperAdmin doesn't change them). Creates the `ApiAccessToken`,
  marks the request `APPROVED`, sends the approval email.
- `PATCH /api-access-requests/:id/reject` — body `{ reason?: string }`. Marks the request
  `REJECTED`, sends the rejection email.
- `GET /api-access-tokens` — list all issued tokens.
- `PATCH /api-access-tokens/:id/revoke` — sets `isRevoked: true`, `revokedAt: now()`.
- `PATCH /api-access-requests/manual` — SuperAdmin uploads/replaces the single static PDF
  manual file (see Email section).

## File uploads

Two upload types, both following this codebase's existing multer + disk-storage pattern (as
used for patient photos): UUID-based filenames, MIME allowlist, size limit matching the app's
existing 10MB nginx cap (`client_max_body_size 10M`).

- **Justification file** (PDF/DOC/DOCX): stored under `uploads/api-access/justifications/`.
- **PDF manual**: stored under `uploads/api-access/manual.pdf` — always the same filename, so
  each new upload overwrites the previous one and there is only ever one active manual.

## Email infrastructure (new)

No email-sending capability exists anywhere in this codebase today. This phase adds:
- `nodemailer` as a new dependency.
- `apps/backend/src/modules/mail/mail.service.ts` — a thin wrapper around SMTP send,
  configured via new env vars added to `.env.example`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `MAIL_FROM`. These are placeholders — the code path is complete and correct, but
  nothing sends successfully until real credentials are filled in later.
- Two Thai HTML email templates (plain template strings, no templating engine needed for just
  two emails):
  - **Approval email**: the plaintext token (shown this one time), a Swagger docs link
    (`SWAGGER_DOCS_URL` env var, a placeholder until real Swagger hosting exists), and a link to
    the static PDF manual (omitted if no manual has been uploaded yet).
  - **Rejection email**: a short notice plus the optional reason SuperAdmin provided.
- Emails are sent synchronously within the approve/reject request handler, not queued via the
  existing Bull queue — that queue is used for bulk/retryable LINE push notifications, which is
  a different concern from a single transactional email fired while SuperAdmin is actively
  waiting for their approve/reject action to complete.

## Frontend

**Public request page** — new route, outside all authenticated route groups (mirroring how
`(auth)/login` and `(auth)/setup` are already public today):
`apps/frontend/src/app/(public)/api-access/request/page.tsx`.
Fields: requester name, organization (optional), email, phone, justification file upload,
usage-level radio (View / Create+Update), and a checkbox tree grouped by entity (checking an
entity selects all its columns by default; individual columns can be unchecked). On submit,
POSTs to `/api-access-requests` and shows a plain Thai confirmation message — no status-lookup
page.

**SuperAdmin screens** — new pages under the existing `(admin)` route group, following the same
list+detail pattern already used by `expense-claims`:
- `apps/frontend/src/app/(admin)/admin/api-access-requests/page.tsx` — table of requests (name,
  org, email, level, status, date), filterable by status.
- `apps/frontend/src/app/(admin)/admin/api-access-requests/[id]/page.tsx` — detail view:
  requester info, justification file link/preview, the shared checkbox-tree component
  (pre-checked from the request, editable) plus the level radio, and Approve/Reject actions.
  Approving shows the generated token once in a copyable box with a "save this now, it won't be
  shown again" note.
- `apps/frontend/src/app/(admin)/admin/api-access-tokens/page.tsx` — table of issued tokens
  (requester, granted scope summary, status, issued date) with a Revoke action per row (a
  simple confirm-then-`PATCH`, not a typed confirmation, since revoking only disables future API
  use and does not delete any data).

The checkbox-tree (entity → columns) is one shared React component, used by both the public
form and the admin detail page, both built from the same `/api-access-requests/catalog`
response — this is what keeps the two screens' checkbox lists guaranteed consistent.

## Testing

- Backend: unit tests for the `ApiAccessService`'s request creation, approve (token generation
  + hash storage + scope narrowing), reject, and revoke logic, mocking `PrismaService` and
  `MailService` — following this codebase's existing Jest + `Test.createTestingModule` pattern.
  A test confirming the plaintext token is never stored (only its hash) is a core case, given
  the security sensitivity of this feature.
- Rate limiting: a test confirming a 4th request from the same IP within the window is rejected.
- Frontend: no test file convention exists for this codebase's frontend components (confirmed
  during a related feature this session) — verification for frontend pieces is type-check plus
  manual/browser verification, consistent with how every other frontend task in this app's
  history has been verified.
