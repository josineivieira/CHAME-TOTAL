import { ApiInput } from '../../common/openapi';
import { Body, Controller, Get, Post, Put, Param, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { UsersService, userSchema } from './users.service';
@Controller('users')
@Require('users.manage')
export class UsersController {
  constructor(@Inject(UsersService) private service: UsersService) {}
  @Get() async list(@Req() r: AuthRequest) {
    return this.service.list(r.actor);
  }
  @Get('roles') async roles(@Req() r: AuthRequest) {
    return this.service.roles(r.actor);
  }
  @ApiInput(userSchema)
  @Post()
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(r.actor, b);
  }
  @ApiInput(userSchema)
  @Put(':id')
  update(@Req() r: AuthRequest, @Body() b: unknown, @Param('id') id: string) {
    return this.service.update(r.actor, b, id);
  }
  @Post(':id/revoke-sessions') revoke(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.revoke(r.actor, id);
  }
  @Post('roles') role(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.role(r.actor, b);
  }
}
