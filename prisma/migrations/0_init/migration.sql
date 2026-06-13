-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SKIP');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "portalId" BIGINT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'bearer',
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "hubspotObjectId" TEXT,
    "portalId" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_ledger" (
    "id" TEXT NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "objectType" TEXT NOT NULL DEFAULT 'contact',
    "hubspotId" TEXT,
    "localId" TEXT,
    "action" "SyncAction" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "contentHash" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" BIGINT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "subscriptionType" TEXT,
    "objectId" BIGINT,
    "portalId" BIGINT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connections_portalId_key" ON "connections"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_hubspotObjectId_key" ON "contacts"("hubspotObjectId");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_portalId_idx" ON "contacts"("portalId");

-- CreateIndex
CREATE INDEX "sync_ledger_hubspotId_idx" ON "sync_ledger"("hubspotId");

-- CreateIndex
CREATE INDEX "sync_ledger_localId_idx" ON "sync_ledger"("localId");

-- CreateIndex
CREATE INDEX "sync_ledger_contentHash_idx" ON "sync_ledger"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_eventId_key" ON "webhook_events"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupKey_key" ON "webhook_events"("dedupKey");

