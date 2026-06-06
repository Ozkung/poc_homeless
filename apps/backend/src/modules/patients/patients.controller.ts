import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN)
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.patients.findAll(user.orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findOne(id, user.orgId);
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.patients.create(user.orgId, user.sub, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.patients.update(id, user.orgId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.remove(id, user.orgId);
  }

  @Get(':id/activities')
  findActivities(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findActivities(id, user.orgId);
  }

  @Get(':id/submissions')
  findSubmissions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findSubmissions(id, user.orgId);
  }
}
