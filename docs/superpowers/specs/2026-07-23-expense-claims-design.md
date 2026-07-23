# Expense Claim (ขอเบิกเงิน) — Design

## Context

CASE_MANAGER and CARE_GIVER need a way to request reimbursement of money spent — either for
themselves, on behalf of a patient, or (for CASE_MANAGER only) on behalf of a Care Giver they're
paying out. Every claim must be reviewed and approved by SUPER_ADMIN before it's considered valid;
no other role can approve.

This mirrors the existing `AdjRequest` (inventory stock adjustment) approval workflow already in
the codebase, which uses the same `PENDING → APPROVED/REJECTED` shape reviewed by a privileged role.

## Data model

Add to `apps/backend/prisma/schema.prisma`:

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

  requestDate    DateTime           // date the requester enters ("วันที่ขอ")
  amount         Float
  description    String             // required — what the money was for ("เกิดจากอะไร")
  additionalNote String?            // optional — extra justification ("เหตุผลการเบิก")

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
}
```

Add corresponding back-relations on `User` (`expenseClaimsRequested`, `expenseClaimsReviewed`,
`expenseClaimsReceived`), on `Organization` (`expenseClaims`), and on `Patient` (`expenseClaims`) —
following the same pattern as `AdjRequest`'s relations on `User`/`InventoryItem`.

### Validation rules (service layer, not DB constraints — matches `AdjRequestDto`/`ReviewAdjDto` style)

- `amount` must be > 0.
- `description` required; `additionalNote` optional; `requestDate` required.
- `payeeType = SELF` → `patientId` and `payeeId` must both be absent.
- `payeeType = PATIENT` → `patientId` required (must exist in the same org). Allowed for both
  CASE_MANAGER and CARE_GIVER requesters.
- `payeeType = CARE_GIVER` → `payeeId` required (must be a `CARE_GIVER`-role user in the same org,
  any team — reuses `GET /users/care-givers`). **Only allowed when the requester's role is
  CASE_MANAGER.** A CARE_GIVER requester may not select `CARE_GIVER` as payee type.

## Backend module: `apps/backend/src/modules/expense-claims/`

Standard NestJS module shape (controller + service + module + dto/), matching `inventory`'s layout.

**DTOs:**
- `CreateExpenseClaimDto`: `requestDate` (ISO date string), `amount` (positive number),
  `description` (non-empty string), `additionalNote?` (string), `payeeType` (enum),
  `patientId?`, `payeeId?`.
- `ReviewExpenseClaimDto`: `status` (`'APPROVED' | 'REJECTED'`), `reviewNote?` (string) —
  identical shape to `ReviewAdjDto`.

**Endpoints** (class-level `@UseGuards(JwtAuthGuard, RolesGuard)`):

| Method | Path | Roles | Behavior |
|---|---|---|---|
| POST | `/expense-claims` | CASE_MANAGER, CARE_GIVER | Validate payee rules per role, create `PENDING` claim. |
| GET | `/expense-claims/mine` | CASE_MANAGER, CARE_GIVER | Own claims (`requestedById = user.sub`), newest first. |
| GET | `/expense-claims` | SUPER_ADMIN | All org claims; optional `?status=` filter. |
| PATCH | `/expense-claims/:id/review` | SUPER_ADMIN | Approve/reject a `PENDING` claim only (mirrors `reviewAdj`'s guard against re-reviewing); sets `reviewedById`, `reviewNote`. |

Audit log each transition via the existing `AuditLogService` (`SUBMIT_CLAIM`, `APPROVE_CLAIM`,
`REJECT_CLAIM`), fire-and-forget `void this.audit.log(...)`, same as every other module.

No auto-approval threshold (unlike inventory's ≤20 auto-approve) — every claim requires explicit
SUPER_ADMIN action since it's money.

## Frontend

- **`apps/frontend/src/app/(cm)/cm/expense-claims/page.tsx`** — form (date picker for `requestDate`,
  amount input, description input, optional note textarea, payee radio: ตัวเอง / ผู้ป่วย / Care Giver
  — conditionally showing `PatientSelect`-style single-select or the `/users/care-givers`-backed
  select) plus a "คำขอของฉัน" table showing status (Tag: เหลือง=PENDING, เขียว=APPROVED,
  แดง=REJECTED) and `reviewNote` when present.
- **`apps/frontend/src/app/(fw)/fw/expense-claims/page.tsx`** — same form, payee radio limited to
  ตัวเอง / ผู้ป่วย (no Care Giver option), same history table.
- **`apps/frontend/src/app/(admin)/admin/expense-claims/page.tsx`** — queue table for SUPER_ADMIN.
  Since the `(admin)` route group's `layout.tsx` allows both ADMIN and SUPER_ADMIN, this page adds
  its own client-side role check (`session.role !== 'SUPER_ADMIN'` → show access-denied) on top of
  the real enforcement point, which is the backend `@Roles(SUPER_ADMIN)` guard. Status filter tabs
  (Pending/Approved/Rejected/All), approve/reject actions open a small modal for the optional
  `reviewNote`.

Add a nav entry ("เบิกเงิน" / "คำขอเบิกเงิน") to each role's existing menu component
(`AppShell` for cm/fw, `AdminShell` for admin) alongside other nav items.

## Out of scope (explicitly deferred, not silently dropped)

- No receipt/attachment upload.
- No LINE push notifications on submit/approve/reject (would need new Bull queue jobs in
  `NotificationsService`/`notifications.processor.ts` plus new `LineService` message templates —
  straightforward to add later following the `AdjRequest`/`enqueueAdjRequest` pattern if wanted).
- No auto-approval threshold.
- No cancel/edit of a submitted claim before it's reviewed.
