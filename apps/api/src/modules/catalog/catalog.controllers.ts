import { ApiInput } from '../../common/openapi';
import { schemas } from './catalog.service';
import { Body, Controller, Get, Post, Put, Param, Query, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CatalogService, Resource } from './catalog.service';
import { AuthRequest, Require } from '../../common/security';
function controller(resource: Resource, read: string, write: string) {
  @Controller(resource)
  @Require(read)
  class CatalogController {
    constructor(@Inject(CatalogService) private service: CatalogService) {}
    @Get() list(@Req() req: AuthRequest, @Query() query: unknown) {
      return this.service.list(resource, req.actor, query);
    }
    @Get(':id') detail(@Req() req: AuthRequest, @Param('id') id: string) {
      return this.service.detail(resource, req.actor, z.uuid().parse(id));
    }
    @ApiInput(schemas[resource])
    @Post()
    @Require(write)
    create(@Req() req: AuthRequest, @Body() body: unknown) {
      return this.service.save(resource, req.actor, body);
    }
    @ApiInput(schemas[resource])
    @Put(':id')
    @Require(write)
    update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
      return this.service.save(resource, req.actor, body, z.uuid().parse(id));
    }
  }
  Object.defineProperty(CatalogController, 'name', { value: resource + 'Controller' });
  return CatalogController;
}
export const CustomerController = controller('customers', 'customers.read', 'customers.manage');
export const EmployeeController = controller('employees', 'employees.read', 'employees.manage');
export const ProductController = controller('products', 'products.read', 'products.manage');
export const SupplierController = controller('suppliers', 'purchases.read', 'purchases.manage');
export const CategoryController = controller('categories', 'products.read', 'products.manage');
