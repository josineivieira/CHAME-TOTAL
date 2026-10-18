ALTER TABLE "FinancialEntry" ADD COLUMN "employeeId" UUID, ADD COLUMN "staffType" TEXT, ADD COLUMN "competenceDate" DATE, ADD COLUMN "resultGroup" TEXT NOT NULL DEFAULT 'OPERATING', ADD COLUMN "cancelledAt" TIMESTAMPTZ(3), ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_companyId_employeeId_fkey" FOREIGN KEY ("companyId","employeeId") REFERENCES "Employee"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_resultGroup_check" CHECK ("resultGroup" IN ('OPERATING','INVENTORY','CAPITAL','FINANCING'));
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_staffType_check" CHECK ("staffType" IS NULL OR "staffType" IN ('SALARY','ADVANCE','BENEFIT','REIMBURSEMENT','OTHER'));
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_personnel_fields_check" CHECK ("source"<>'PERSONNEL' OR ("employeeId" IS NOT NULL AND "staffType" IS NOT NULL AND "competenceDate" IS NOT NULL AND "direction"='OUT'));
ALTER TABLE "FinancialEntry" DROP CONSTRAINT "financial_values";
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "financial_values" CHECK (amount>0 AND "settledAmount">=0 AND "settledAmount"<=amount AND direction IN ('IN','OUT') AND status IN ('OPEN','PARTIAL','SETTLED','CANCELLED') AND (status<>'CANCELLED' OR "settledAmount"=0));
CREATE INDEX "FinancialEntry_companyId_storeId_employeeId_competenceDate_idx" ON "FinancialEntry"("companyId","storeId","employeeId","competenceDate");
CREATE UNIQUE INDEX "FinancialSettlement_companyId_id_key" ON "FinancialSettlement"("companyId","id");
CREATE TABLE "StaffAdvanceAllocation" (
 "id" UUID PRIMARY KEY,"companyId" UUID NOT NULL,"userId" UUID NOT NULL,"advanceEntryId" UUID NOT NULL,"salaryEntryId" UUID NOT NULL,"salarySettlementId" UUID NOT NULL,"amount" NUMERIC(19,2) NOT NULL CHECK (amount>0),"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 FOREIGN KEY ("companyId","advanceEntryId") REFERENCES "FinancialEntry"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 FOREIGN KEY ("companyId","salaryEntryId") REFERENCES "FinancialEntry"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 FOREIGN KEY ("companyId","salarySettlementId") REFERENCES "FinancialSettlement"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX "StaffAdvanceAllocation_companyId_advanceEntryId_idx" ON "StaffAdvanceAllocation"("companyId","advanceEntryId");
CREATE INDEX "StaffAdvanceAllocation_companyId_salaryEntryId_idx" ON "StaffAdvanceAllocation"("companyId","salaryEntryId");
CREATE TRIGGER "StaffAdvanceAllocation_immutable" BEFORE UPDATE OR DELETE ON "StaffAdvanceAllocation" FOR EACH ROW EXECUTE FUNCTION chame_treasury_immutable();
ALTER TABLE "TreasuryEntry" DROP CONSTRAINT "TreasuryEntry_kind_check", DROP CONSTRAINT "TreasuryEntry_check";
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_kind_check" CHECK ("kind" IN ('MANUAL','REVERSAL','PURCHASE_PAYMENT','PURCHASE_REFUND','FINANCE_PAYMENT','FINANCE_RECEIPT','COMMISSION_PAYMENT','PERSONNEL_PAYMENT'));
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_check" CHECK (("kind"<>'REVERSAL' AND "reversesId" IS NULL) OR ("kind"='REVERSAL' AND "reversesId" IS NOT NULL));
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_company_finance_sign_check" CHECK (("kind" NOT IN ('FINANCE_PAYMENT','COMMISSION_PAYMENT','PERSONNEL_PAYMENT') OR amount<0) AND ("kind"<>'FINANCE_RECEIPT' OR amount>0));
INSERT INTO "Permission" ("key") VALUES ('payroll.read'),('payroll.manage') ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionKey") SELECT r.id,p.key FROM "Role" r CROSS JOIN "Permission" p WHERE p.key IN ('payroll.read','payroll.manage') AND EXISTS(SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r.id AND rp."permissionKey"='finance.manage') AND EXISTS(SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r.id AND rp."permissionKey"='finance.read') ON CONFLICT DO NOTHING;
