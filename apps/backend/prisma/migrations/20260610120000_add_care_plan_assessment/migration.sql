-- CreateTable
CREATE TABLE "CarePlanAssessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3),
    "locationFound" TEXT,
    "careSetting" TEXT,
    "referralSource" TEXT,
    "status" TEXT,
    "helpGoal" TEXT,
    "homelessType" TEXT,
    "notes" TEXT,
    "healthcareRight" TEXT,
    "primaryCareUnit" TEXT,
    "referralUnit" TEXT,
    "ncdConditions" TEXT[],
    "infectiousConditions" TEXT[],
    "mentalConditions" TEXT[],
    "substanceConditions" TEXT[],
    "disabilityConditions" TEXT[],
    "otherConditionCategories" TEXT[],
    "conditionNote" TEXT,
    "mentalConditionNote" TEXT,
    "medicalGoals" TEXT[],
    "medicalGoalOther" TEXT,
    "socialGoals" TEXT[],
    "socialGoalOther" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarePlanAssessment_patientId_key" ON "CarePlanAssessment"("patientId");

-- AddForeignKey
ALTER TABLE "CarePlanAssessment" ADD CONSTRAINT "CarePlanAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
