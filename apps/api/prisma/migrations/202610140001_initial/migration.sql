-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "companyId" UUID NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'CHAME TOTAL',
    "legalName" TEXT NOT NULL DEFAULT '',
    "document" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 10,
    "loyaltyPointsPerReal" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "employeeId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaPendingSecret" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "birthDate" DATE,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT NOT NULL DEFAULT 'Vendedora',
    "commissionPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "hiredAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "description" TEXT,
    "categoryId" UUID,
    "supplierId" UUID,
    "brand" TEXT,
    "cost" DECIMAL(19,6) NOT NULL,
    "price" DECIMAL(19,2) NOT NULL,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "variantAttributes" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" UUID,
    "reason" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "customerId" UUID,
    "employeeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "subtotal" DECIMAL(19,2) NOT NULL,
    "discount" DECIMAL(19,2) NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "costTotal" DECIMAL(19,2) NOT NULL,
    "returnedTotal" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "commissionPercent" DECIMAL(9,4) NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "returnedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(19,2) NOT NULL,
    "unitCost" DECIMAL(19,6) NOT NULL,
    "discount" DECIMAL(19,2) NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "refundMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "restock" BOOLEAN NOT NULL,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingAmount" DECIMAL(19,2) NOT NULL,
    "expectedAmount" DECIMAL(19,2),
    "countedAmount" DECIMAL(19,2),
    "difference" DECIMAL(19,2),
    "justification" TEXT,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "amount" DECIMAL(19,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "settledAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "costCenter" TEXT NOT NULL DEFAULT 'Loja',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "referenceId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettlement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "userId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(3),
    "settlementId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesGoal" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "employeeId" UUID,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "total" DECIMAL(19,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "receivedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,6) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "saleId" UUID,
    "userId" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "customerId" UUID,
    "employeeId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "saleId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_companyId_id_key" ON "Store"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_id_key" ON "Role"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_id_key" ON "Customer"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_cpf_key" ON "Customer"("companyId", "cpf");

-- CreateIndex
CREATE INDEX "Employee_companyId_name_idx" ON "Employee"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_id_key" ON "Employee"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_id_key" ON "Category"("companyId", "id");

-- CreateIndex
CREATE INDEX "Supplier_companyId_name_idx" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_id_key" ON "Supplier"("companyId", "id");

-- CreateIndex
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_id_key" ON "Product"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_barcode_key" ON "Product"("companyId", "barcode");

-- CreateIndex
CREATE INDEX "StockBalance_companyId_storeId_idx" ON "StockBalance"("companyId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_storeId_productId_key" ON "StockBalance"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_storeId_createdAt_idx" ON "StockMovement"("companyId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_companyId_storeId_createdAt_idx" ON "Sale"("companyId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_employeeId_createdAt_idx" ON "Sale"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_id_key" ON "Sale"("companyId", "id");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_companyId_id_key" ON "SaleItem"("companyId", "id");

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- CreateIndex
CREATE INDEX "SaleReturn_saleId_idx" ON "SaleReturn"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_companyId_id_key" ON "SaleReturn"("companyId", "id");

-- CreateIndex
CREATE INDEX "CashSession_companyId_storeId_status_idx" ON "CashSession"("companyId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_companyId_id_key" ON "CashSession"("companyId", "id");

-- CreateIndex
CREATE INDEX "CashMovement_cashSessionId_createdAt_idx" ON "CashMovement"("cashSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialEntry_companyId_storeId_dueDate_status_idx" ON "FinancialEntry"("companyId", "storeId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_companyId_id_key" ON "FinancialEntry"("companyId", "id");

-- CreateIndex
CREATE INDEX "FinancialSettlement_entryId_idx" ON "FinancialSettlement"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEntry_sourceId_key" ON "CommissionEntry"("sourceId");

-- CreateIndex
CREATE INDEX "CommissionEntry_companyId_storeId_employeeId_status_idx" ON "CommissionEntry"("companyId", "storeId", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSettlement_companyId_id_key" ON "CommissionSettlement"("companyId", "id");

-- CreateIndex
CREATE INDEX "SalesGoal_companyId_storeId_period_idx" ON "SalesGoal"("companyId", "storeId", "period");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_storeId_createdAt_idx" ON "PurchaseOrder"("companyId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_companyId_id_key" ON "PurchaseOrder"("companyId", "id");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseId_idx" ON "PurchaseOrderItem"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderItem_companyId_id_key" ON "PurchaseOrderItem"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_companyId_id_key" ON "GoodsReceipt"("companyId", "id");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_companyId_userId_operation_key_key" ON "IdempotencyRecord"("companyId", "userId", "operation", "key");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_companyId_customerId_idx" ON "LoyaltyTransaction"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_saleId_key" ON "Quotation"("saleId");

-- CreateIndex
CREATE INDEX "Quotation_companyId_storeId_createdAt_idx" ON "Quotation"("companyId", "storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_companyId_id_key" ON "Quotation"("companyId", "id");

ALTER TABLE "Store" ADD CONSTRAINT "Store_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Role" ADD CONSTRAINT "Role_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "User" ADD CONSTRAINT "User_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_company_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT;
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "Category"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fk" FOREIGN KEY ("companyId","supplierId") REFERENCES "Supplier"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fk" FOREIGN KEY ("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fk" FOREIGN KEY ("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fk" FOREIGN KEY ("companyId","customerId") REFERENCES "Customer"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fk" FOREIGN KEY ("companyId","cashSessionId") REFERENCES "CashSession"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fk" FOREIGN KEY ("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_returnId_fk" FOREIGN KEY ("companyId","returnId") REFERENCES "SaleReturn"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleItemId_fk" FOREIGN KEY ("companyId","saleItemId") REFERENCES "SaleItem"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fk" FOREIGN KEY ("companyId","cashSessionId") REFERENCES "CashSession"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_entryId_fk" FOREIGN KEY ("companyId","entryId") REFERENCES "FinancialEntry"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_settlementId_fk" FOREIGN KEY ("companyId","settlementId") REFERENCES "CommissionSettlement"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fk" FOREIGN KEY ("companyId","supplierId") REFERENCES "Supplier"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseId_fk" FOREIGN KEY ("companyId","purchaseId") REFERENCES "PurchaseOrder"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fk" FOREIGN KEY ("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseId_fk" FOREIGN KEY ("companyId","purchaseId") REFERENCES "PurchaseOrder"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_receiptId_fk" FOREIGN KEY ("companyId","receiptId") REFERENCES "GoodsReceipt"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchaseItemId_fk" FOREIGN KEY ("companyId","purchaseItemId") REFERENCES "PurchaseOrderItem"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fk" FOREIGN KEY ("companyId","customerId") REFERENCES "Customer"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_storeId_fk" FOREIGN KEY ("companyId","storeId") REFERENCES "Store"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_userId_fk" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fk" FOREIGN KEY ("companyId","customerId") REFERENCES "Customer"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_employeeId_fk" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_saleId_fk" FOREIGN KEY ("companyId","saleId") REFERENCES "Sale"("companyId","id") ON DELETE RESTRICT;
ALTER TABLE "Session" ADD CONSTRAINT "session_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "reset_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "mfa_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "RolePermission" ADD CONSTRAINT "role_permission_role_fk" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT;
ALTER TABLE "RolePermission" ADD CONSTRAINT "role_permission_key_fk" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT;
ALTER TABLE "UserRole" ADD CONSTRAINT "user_role_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "UserRole" ADD CONSTRAINT "user_role_role_fk" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT;
ALTER TABLE "StockBalance" ADD CONSTRAINT "stock_nonnegative" CHECK (quantity>=0 AND reserved>=0 AND reserved<=quantity);
ALTER TABLE "Product" ADD CONSTRAINT "product_values" CHECK (cost>=0 AND price>=0 AND "minStock">=0);
ALTER TABLE "Employee" ADD CONSTRAINT "employee_percent" CHECK ("commissionPercent">=0 AND "commissionPercent"<=100);
ALTER TABLE "Sale" ADD CONSTRAINT "sale_values" CHECK (subtotal>=0 AND discount>=0 AND discount<=subtotal AND total=subtotal-discount AND "returnedTotal">=0 AND "returnedTotal"<=total);
ALTER TABLE "Sale" ADD CONSTRAINT "sale_status" CHECK (status IN ('CONFIRMED','CANCELLED'));
ALTER TABLE "SaleItem" ADD CONSTRAINT "sale_item_values" CHECK (quantity>0 AND "returnedQuantity">=0 AND "returnedQuantity"<=quantity AND "unitPrice">=0 AND "unitCost">=0 AND discount>=0 AND total>=0);
ALTER TABLE "SalePayment" ADD CONSTRAINT "payment_positive" CHECK (amount>0);
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "return_item_positive" CHECK (quantity>0 AND total>=0);
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "financial_values" CHECK (amount>0 AND "settledAmount">=0 AND "settledAmount"<=amount AND direction IN ('IN','OUT') AND status IN ('OPEN','PARTIAL','SETTLED'));
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "settlement_positive" CHECK (amount>0);
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "purchase_values" CHECK (quantity>0 AND "receivedQuantity">=0 AND "receivedQuantity"<=quantity AND "unitCost">=0);
ALTER TABLE "SalesGoal" ADD CONSTRAINT "goal_positive" CHECK (amount>0);
CREATE UNIQUE INDEX "cash_one_open_per_store" ON "CashSession"("storeId") WHERE status='OPEN';
CREATE UNIQUE INDEX "goal_store_period_unique" ON "SalesGoal"("storeId",period) WHERE "employeeId" IS NULL;
CREATE UNIQUE INDEX "goal_employee_period_unique" ON "SalesGoal"("storeId",period,"employeeId") WHERE "employeeId" IS NOT NULL;
CREATE FUNCTION chame_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registro historico imutavel' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION chame_append_only();
CREATE TRIGGER stock_movement_append_only BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION chame_append_only();
CREATE TRIGGER cash_movement_append_only BEFORE UPDATE OR DELETE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION chame_append_only();
CREATE TRIGGER sale_payment_append_only BEFORE UPDATE OR DELETE ON "SalePayment" FOR EACH ROW EXECUTE FUNCTION chame_append_only();
CREATE FUNCTION chame_sale_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Item historico imutavel'; END IF; IF (to_jsonb(NEW)-'returnedQuantity') IS DISTINCT FROM (to_jsonb(OLD)-'returnedQuantity') THEN RAISE EXCEPTION 'Snapshot de item imutavel'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER sale_item_snapshot BEFORE UPDATE OR DELETE ON "SaleItem" FOR EACH ROW EXECUTE FUNCTION chame_sale_item_snapshot();
CREATE FUNCTION chame_same_company_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM "User" u JOIN "Role" r ON r."companyId"=u."companyId" WHERE u.id=NEW."userId" AND r.id=NEW."roleId") THEN RAISE EXCEPTION 'Perfil fora da empresa' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER user_role_company BEFORE INSERT OR UPDATE ON "UserRole" FOR EACH ROW EXECUTE FUNCTION chame_same_company_role();