import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.users.findAll(user.orgId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.create({ ...dto, orgId: user.orgId });
  }

  @Get('my-fw')
  @Roles(UserRole.CASE_MANAGER)
  getMyFW(@CurrentUser() user: JwtPayload) {
    return this.users.getMyFW(user.sub, user.orgId);
  }

  @Post('fw')
  @Roles(UserRole.CASE_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  createFW(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.createFW(user.sub, user.orgId, dto);
  }

  @Patch(':id/zone')
  @Roles(UserRole.SUPER_ADMIN)
  assignZone(
    @Param('id') id: string,
    @Body('zoneId') zoneId: string | null,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.users.assignZone(id, zoneId ?? null, user.orgId);
  }

  @Patch(':id/transfer')
  @Roles(UserRole.SUPER_ADMIN)
  transferFW(
    @Param('id') id: string,
    @Body('supervisorId') supervisorId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.users.transferFW(id, supervisorId, user.orgId);
  }

  @Patch(':id/password')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id') id: string,
    @Body('password') password: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.users.resetPassword(id, user.orgId, user.sub, password);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CASE_MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.users.update(id, user.orgId, user.sub, dto, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.CASE_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.users.deactivate(id, user.orgId, user.sub, user.role);
  }
}
