
CREATE TABLE "TreasuryBaseline" (
 "companyId" UUID PRIMARY KEY REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 "amount" NUMERIC(19,2) NOT NULL,
 "startsAt" TIMESTAMPTZ(3) NOT NULL,
 "userId" UUID NOT NULL,
 "reason" TEXT NOT NULL CHECK(length(trim("reason")) >= 5),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE TABLE "TreasuryEntry" (
 "id" UUID PRIMARY KEY,
 "companyId" UUID NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 "userId" UUID NOT NULL,
 "amount" NUMERIC(19,2) NOT NULL CHECK("amount" <> 0),
 "method" TEXT NOT NULL CHECK("method" IN ('CASH','PIX','DEBIT','CREDIT','BANK','OTHER')),
 "description" TEXT NOT NULL CHECK(length(trim("description")) >= 5),
 "kind" TEXT NOT NULL DEFAULT 'MANUAL' CHECK("kind" IN ('MANUAL','REVERSAL')),
 "reversesId" UUID UNIQUE,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("companyId","id"),
 UNIQUE("companyId","reversesId"),
 FOREIGN KEY ("companyId","userId") REFERENCES "User"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 FOREIGN KEY ("companyId","reversesId") REFERENCES "TreasuryEntry"("companyId","id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 CHECK(("kind" = 'MANUAL' AND "reversesId" IS NULL) OR ("kind" = 'REVERSAL' AND "reversesId" IS NOT NULL))
);
CREATE INDEX "TreasuryEntry_companyId_createdAt_id_idx" ON "TreasuryEntry"("companyId","createdAt","id");
CREATE INDEX "CashMovement_companyId_createdAt_idx" ON "CashMovement"("companyId","createdAt");
CREATE FUNCTION chame_treasury_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Treasury ledger is immutable; record a reversal instead'; END;
$$;
CREATE TRIGGER "TreasuryEntry_immutable" BEFORE UPDATE OR DELETE ON "TreasuryEntry" FOR EACH ROW EXECUTE FUNCTION chame_treasury_immutable();
CREATE TRIGGER "TreasuryBaseline_immutable" BEFORE UPDATE OR DELETE ON "TreasuryBaseline" FOR EACH ROW EXECUTE FUNCTION chame_treasury_immutable();
INSERT INTO "Permission"("key") VALUES ('treasury.read'),('treasury.manage') ON CONFLICT DO NOTHING;
-- Only existing roles that already have full user/settings/finance administration gain this new company-wide feature.
INSERT INTO "RolePermission"("roleId","permissionKey")
SELECT r."id",p."key" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key" IN ('treasury.read','treasury.manage')
AND EXISTS(SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r."id" AND rp."permissionKey"='users.manage')
AND EXISTS(SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r."id" AND rp."permissionKey"='settings.manage')
AND EXISTS(SELECT 1 FROM "RolePermission" rp WHERE rp."roleId"=r."id" AND rp."permissionKey"='finance.manage')
ON CONFLICT DO NOTHING;
