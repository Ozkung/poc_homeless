CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId"        TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "entity"         TEXT NOT NULL,
    "entityId"       TEXT,
    "detail"         TEXT,
    "adminNote"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt" DESC);
