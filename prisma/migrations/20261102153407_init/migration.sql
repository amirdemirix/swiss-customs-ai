-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'DECLARANT', 'REVIEWER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "public"."Direction" AS ENUM ('IMPORT', 'EXPORT', 'TRANSIT');

-- CreateEnum
CREATE TYPE "public"."TransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'SEA', 'POST', 'PIPELINE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('DRAFT', 'PROCESSING', 'NEEDS_REVIEW', 'READY', 'EXPORTED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."DocumentKind" AS ENUM ('PDF_TEXT', 'PDF_SCAN', 'IMAGE', 'SPREADSHEET', 'CSV', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'EXTRACTED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('PARSE_DOCUMENT', 'OCR', 'AI_EXTRACT', 'VALIDATE_ORDER', 'CONSOLIDATE_ORDER', 'EXPORT_EXCEL', 'RETENTION_PURGE');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ReviewStatus" AS ENUM ('EXTRACTED', 'NEEDS_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "public"."ValueSource" AS ENUM ('INVOICE', 'USER', 'AI_SUGGESTION', 'MASTER_DATA', 'CALCULATED');

-- CreateEnum
CREATE TYPE "public"."PreferenceStatus" AS ENUM ('NONE', 'CLAIMED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."Severity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "public"."ExportKind" AS ENUM ('EXCEL_OVERVIEW', 'DECLARATION_JSON');

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aiProcessingConsent" BOOLEAN NOT NULL DEFAULT false,
    "aiConsentGrantedAt" TIMESTAMP(3),
    "aiConsentGrantedById" TEXT,
    "retentionDays" INTEGER,
    "reviewConfidenceThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'CHF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "uid" TEXT,
    "address" TEXT,
    "country" CHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArticleMaster" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "description" TEXT,
    "tariffNumber" VARCHAR(9),
    "statisticalKey" VARCHAR(3),
    "originCountry" CHAR(2),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomsOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "direction" "public"."Direction" NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "consignor" TEXT,
    "consignee" TEXT,
    "dispatchCountry" CHAR(2),
    "destinationCountry" CHAR(2),
    "transportMode" "public"."TransportMode",
    "reference" TEXT,
    "orderDate" DATE NOT NULL,
    "remarks" TEXT,
    "declarationCurrency" CHAR(3) NOT NULL DEFAULT 'CHF',
    "groupingProfileId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "encryptionIv" TEXT,
    "kind" "public"."DocumentKind" NOT NULL DEFAULT 'UNKNOWN',
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "pageCount" INTEGER,
    "errorMessage" TEXT,
    "duplicateOfId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessingJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT,
    "orderId" TEXT,
    "type" "public"."JobType" NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentId" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "supplierName" TEXT,
    "supplierCountry" CHAR(2),
    "currency" CHAR(3),
    "totalAmount" DECIMAL(18,4),
    "incoterm" VARCHAR(3),
    "incotermPlace" TEXT,
    "freightAmount" DECIMAL(18,4),
    "insuranceAmount" DECIMAL(18,4),
    "discountAmount" DECIMAL(18,4),
    "grossWeightKg" DECIMAL(14,3),
    "netWeightKg" DECIMAL(14,3),
    "packages" TEXT,
    "reviewStatus" "public"."ReviewStatus" NOT NULL DEFAULT 'EXTRACTED',
    "extractionMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "articleNumber" TEXT,
    "description" TEXT,
    "tariffNumber" VARCHAR(9),
    "tariffNumberSource" "public"."ValueSource",
    "statisticalKey" VARCHAR(3),
    "originCountry" CHAR(2),
    "originSource" "public"."ValueSource",
    "preferenceStatus" "public"."PreferenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "customsProcedure" TEXT,
    "quantity" DECIMAL(18,4),
    "unit" VARCHAR(10),
    "unitPrice" DECIMAL(18,6),
    "lineAmount" DECIMAL(18,4),
    "netWeightKg" DECIMAL(14,3),
    "grossWeightKg" DECIMAL(14,3),
    "packaging" TEXT,
    "extraAttributes" JSONB,
    "reviewStatus" "public"."ReviewStatus" NOT NULL DEFAULT 'EXTRACTED',
    "fieldMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "keyFields" TEXT[],
    "extraKeys" TEXT[],
    "requiredFields" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExchangeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT,
    "fromCurrency" CHAR(3) NOT NULL,
    "toCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "validOn" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeclarationLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "groupKey" TEXT NOT NULL,
    "tariffNumber" VARCHAR(9),
    "statisticalKey" VARCHAR(3),
    "originCountry" CHAR(2),
    "preferenceStatus" "public"."PreferenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "customsProcedure" TEXT,
    "description" TEXT,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalQuantity" DECIMAL(18,4),
    "quantityUnit" VARCHAR(10),
    "netWeightKg" DECIMAL(14,3),
    "grossWeightKg" DECIMAL(14,3),
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeclarationLineSource" (
    "declarationLineId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "convertedValue" DECIMAL(18,4) NOT NULL,
    "exchangeRateId" TEXT,

    CONSTRAINT "DeclarationLineSource_pkey" PRIMARY KEY ("declarationLineId","invoiceLineId")
);

-- CreateTable
CREATE TABLE "public"."ValidationIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "public"."Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExportFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "public"."ExportKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "public"."Membership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "public"."Customer"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_number_key" ON "public"."Customer"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleMaster_tenantId_customerId_articleNumber_key" ON "public"."ArticleMaster"("tenantId", "customerId", "articleNumber");

-- CreateIndex
CREATE INDEX "CustomsOrder_tenantId_status_idx" ON "public"."CustomsOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomsOrder_tenantId_updatedAt_idx" ON "public"."CustomsOrder"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsOrder_tenantId_orderNumber_key" ON "public"."CustomsOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "Document_tenantId_sha256_idx" ON "public"."Document"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "Document_orderId_idx" ON "public"."Document"("orderId");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_runAfter_idx" ON "public"."ProcessingJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "ProcessingJob_tenantId_idx" ON "public"."ProcessingJob"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_orderId_idx" ON "public"."Invoice"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_supplierName_invoiceNumber_idx" ON "public"."Invoice"("tenantId", "supplierName", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_tariffNumber_originCountry_idx" ON "public"."InvoiceLine"("tenantId", "tariffNumber", "originCountry");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_articleNumber_idx" ON "public"."InvoiceLine"("tenantId", "articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_lineNo_key" ON "public"."InvoiceLine"("invoiceId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "GroupingProfile_tenantId_name_key" ON "public"."GroupingProfile"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_fromCurrency_toCurrency_validOn_idx" ON "public"."ExchangeRate"("tenantId", "fromCurrency", "toCurrency", "validOn");

-- CreateIndex
CREATE INDEX "DeclarationLine_tenantId_orderId_idx" ON "public"."DeclarationLine"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationLine_orderId_position_key" ON "public"."DeclarationLine"("orderId", "position");

-- CreateIndex
CREATE INDEX "ValidationIssue_tenantId_orderId_severity_idx" ON "public"."ValidationIssue"("tenantId", "orderId", "severity");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "public"."AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "public"."AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportFile_tenantId_orderId_idx" ON "public"."ExportFile"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleMaster" ADD CONSTRAINT "ArticleMaster_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleMaster" ADD CONSTRAINT "ArticleMaster_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomsOrder" ADD CONSTRAINT "CustomsOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomsOrder" ADD CONSTRAINT "CustomsOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomsOrder" ADD CONSTRAINT "CustomsOrder_groupingProfileId_fkey" FOREIGN KEY ("groupingProfileId") REFERENCES "public"."GroupingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessingJob" ADD CONSTRAINT "ProcessingJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceLine" ADD CONSTRAINT "InvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupingProfile" ADD CONSTRAINT "GroupingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExchangeRate" ADD CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExchangeRate" ADD CONSTRAINT "ExchangeRate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeclarationLine" ADD CONSTRAINT "DeclarationLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeclarationLine" ADD CONSTRAINT "DeclarationLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeclarationLineSource" ADD CONSTRAINT "DeclarationLineSource_declarationLineId_fkey" FOREIGN KEY ("declarationLineId") REFERENCES "public"."DeclarationLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeclarationLineSource" ADD CONSTRAINT "DeclarationLineSource_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "public"."InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationIssue" ADD CONSTRAINT "ValidationIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationIssue" ADD CONSTRAINT "ValidationIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExportFile" ADD CONSTRAINT "ExportFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExportFile" ADD CONSTRAINT "ExportFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."CustomsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
