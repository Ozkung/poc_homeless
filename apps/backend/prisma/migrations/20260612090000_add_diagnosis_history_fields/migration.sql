-- AlterTable: add patient history fields to Diagnosis
ALTER TABLE "Diagnosis"
  ADD COLUMN "chiefComplaint" TEXT,
  ADD COLUMN "presentIllness" TEXT,
  ADD COLUMN "vitalSigns"     JSONB,
  ADD COLUMN "physicalExam"   TEXT,
  ADD COLUMN "treatmentPlan"  TEXT;
