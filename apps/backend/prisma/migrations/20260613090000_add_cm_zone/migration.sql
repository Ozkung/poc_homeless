-- Add zoneId to User for CASE_MANAGER zone assignment
ALTER TABLE "User" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;
