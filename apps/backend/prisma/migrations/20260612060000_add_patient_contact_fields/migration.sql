-- AlterTable
ALTER TABLE "Patient"
  ADD COLUMN "phone"         TEXT,
  ADD COLUMN "birthDate"     TIMESTAMP(3),
  ADD COLUMN "nationalIdEnc" TEXT;
