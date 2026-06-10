-- Drop unique constraint on patientId to allow multiple assessments per patient
DROP INDEX IF EXISTS "CarePlanAssessment_patientId_key";
