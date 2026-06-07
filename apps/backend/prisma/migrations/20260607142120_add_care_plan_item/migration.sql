-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MED',
    "assigneeName" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
