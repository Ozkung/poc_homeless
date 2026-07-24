-- CreateEnum
CREATE TYPE "ApiAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApiAccessLevel" AS ENUM ('VIEW', 'CREATE_UPDATE');

-- CreateTable
CREATE TABLE "ApiAccessRequest" (
    "id" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterOrg" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "justificationFileUrl" TEXT NOT NULL,
    "requestedLevel" "ApiAccessLevel" NOT NULL,
    "requestedScope" JSONB NOT NULL,
    "status" "ApiAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAccessToken" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "grantedLevel" "ApiAccessLevel" NOT NULL,
    "grantedScope" JSONB NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiAccessRequest_status_idx" ON "ApiAccessRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiAccessToken_requestId_key" ON "ApiAccessToken"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiAccessToken_tokenHash_key" ON "ApiAccessToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "ApiAccessRequest" ADD CONSTRAINT "ApiAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiAccessToken" ADD CONSTRAINT "ApiAccessToken_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApiAccessRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
