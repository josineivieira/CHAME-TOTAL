CREATE TABLE "PurchaseIssue" (
 "id" UUID NOT NULL, "companyId" UUID NOT NULL, "purchaseItemId" UUID NOT NULL, "userId" UUID NOT NULL,
 "action" TEXT NOT NULL CHECK ("action" IN ('WAIT','REFUND','CREDIT')),
 "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity">0), "amount" DECIMAL(19,2) NOT NULL CHECK ("amount">=0),
 "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','RESOLVED')),
 "resolution" TEXT, "resolvedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PurchaseIssue_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PurchaseIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT "PurchaseIssue_companyId_purchaseItemId_fkey" FOREIGN KEY ("companyId","purchaseItemId") REFERENCES "PurchaseOrderItem"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT "PurchaseIssue_companyId_userId_fkey" FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX "PurchaseIssue_companyId_purchaseItemId_createdAt_idx" ON "PurchaseIssue"("companyId","purchaseItemId","createdAt");
CREATE UNIQUE INDEX "PurchaseIssue_one_open_per_item" ON "PurchaseIssue"("purchaseItemId") WHERE "status"='OPEN';
