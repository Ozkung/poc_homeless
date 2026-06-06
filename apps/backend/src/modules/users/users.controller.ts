import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.users.findOne(user.sub, user.orgId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.users.findAll(user.orgId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() body: { email: string; password: string; displayName: string; role: string }, @CurrentUser() user: JwtPayload) {
    return this.users.create({ ...body, orgId: user.orgId });
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: { displayName?: string; isActive?: boolean }, @CurrentUser() user: JwtPayload) {
    return this.users.update(id, user.orgId, body);
  }
}
