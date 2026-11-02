-- CreateTable
CREATE TABLE "public"."TariffDataset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TariffEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "tariffNumber" VARCHAR(9) NOT NULL,
    "statisticalKey" VARCHAR(3),
    "description" TEXT NOT NULL,
    "unit" TEXT,

    CONSTRAINT "TariffEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TariffDataset_tenantId_isActive_idx" ON "public"."TariffDataset"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TariffEntry_tenantId_datasetId_tariffNumber_idx" ON "public"."TariffEntry"("tenantId", "datasetId", "tariffNumber");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "public"."LoginAttempt"("key", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."TariffDataset" ADD CONSTRAINT "TariffDataset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TariffEntry" ADD CONSTRAINT "TariffEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TariffEntry" ADD CONSTRAINT "TariffEntry_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."TariffDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
