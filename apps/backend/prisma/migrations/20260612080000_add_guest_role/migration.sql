-- Add GUEST to UserRole enum
ALTER TYPE "UserRole" ADD VALUE 'GUEST';

-- Add preferredZoneId to User
ALTER TABLE "User" ADD COLUMN "preferredZoneId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_preferredZoneId_fkey"
  FOREIGN KEY ("preferredZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
