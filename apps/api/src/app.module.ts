import { ResultsController } from './modules/treasury/results.controller';
import { ResultsService } from './modules/treasury/results.service';
import { CompanyPaymentsService } from './modules/company-payments/company-payments.service';
import { CompanyPaymentsController } from './modules/company-payments/company-payments.controller';
import { PersonnelController } from './modules/personnel/personnel.controller';
import { PersonnelService } from './modules/personnel/personnel.service';
import { TreasuryController } from './modules/treasury/treasury.controller';
import { TreasuryService } from './modules/treasury/treasury.service';
import { FinanceService } from './modules/finance/finance.service';
import { CommissionsService } from './modules/commissions/commissions.service';
import { InventoryService } from './modules/inventory/inventory.service';
import { UsersService } from './modules/management/users.service';
import { GoalsService } from './modules/management/goals.service';
import { LoyaltyService } from './modules/management/loyalty.service';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './common/db';
import { AccessGuard } from './common/security';
import { BootstrapController } from './modules/bootstrap/bootstrap.controller';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { CustomerHistoryController } from './modules/catalog/history.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import {
  CustomerController,
  EmployeeController,
  ProductController,
  SupplierController,
  CategoryController,
} from './modules/catalog/catalog.controllers';
import { InventoryController } from './modules/inventory/inventory.controller';
import { CashController } from './modules/cash/cash.controller';
import { CashService } from './modules/cash/cash.service';
import { SalesController } from './modules/sales/sales.controller';
import { SalesService } from './modules/sales/sales.service';
import { FinanceController } from './modules/finance/finance.controller';
import { PurchasesController } from './modules/purchases/purchases.controller';
import { PurchasesService } from './modules/purchases/purchases.service';
import { CommissionsController } from './modules/commissions/commissions.controller';
import { SettingsController } from './modules/management/settings.controller';
import { UsersController } from './modules/management/users.controller';
import { GoalsController } from './modules/management/goals.controller';
import { AuditController } from './modules/management/audit.controller';
import { NotificationsController } from './modules/management/notifications.controller';
import { LoyaltyController } from './modules/management/loyalty.controller';
import { DashboardController, ReportsController } from './modules/reports/reports.controller';
import { ReportsService } from './modules/reports/reports.service';
import { HealthController } from './health.controller';
@Module({ controllers: [AuthController, BootstrapController], providers: [AuthService] })
class AuthModule {}
@Module({
  controllers: [
    CustomerHistoryController,
    CustomerController,
    EmployeeController,
    ProductController,
    SupplierController,
    CategoryController,
  ],
  providers: [CatalogService],
})
class CatalogModule {}
@Module({ controllers: [InventoryController], providers: [InventoryService] })
class InventoryModule {}
@Module({ controllers: [CashController], providers: [CashService] })
class CashModule {}
@Module({ controllers: [SalesController], providers: [SalesService] })
class SalesModule {}
@Module({
  controllers: [
    FinanceController,
    TreasuryController,
    ResultsController,
    CompanyPaymentsController,
    PersonnelController,
  ],
  providers: [
    FinanceService,
    TreasuryService,
    CompanyPaymentsService,
    PersonnelService,
    ResultsService,
  ],
})
class FinanceModule {}
@Module({ controllers: [PurchasesController], providers: [PurchasesService] })
class PurchasesModule {}
@Module({ controllers: [CommissionsController], providers: [CommissionsService] })
class CommissionsModule {}
@Module({
  controllers: [
    SettingsController,
    UsersController,
    GoalsController,
    AuditController,
    NotificationsController,
    LoyaltyController,
  ],
  providers: [UsersService, GoalsService, LoyaltyService],
})
class ManagementModule {}
@Module({ controllers: [DashboardController, ReportsController], providers: [ReportsService] })
class ReportsModule {}
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    CashModule,
    SalesModule,
    FinanceModule,
    PurchasesModule,
    CommissionsModule,
    ManagementModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [AccessGuard, { provide: APP_GUARD, useExisting: AccessGuard }],
})
export class AppModule {}
