import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('forms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class FormsController {
  constructor(private forms: FormsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.forms.findAll(user.orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.forms.findOne(id, user.orgId);
  }

  @Post()
  create(@Body() body: { title: string; description?: string; fields: any[] }, @CurrentUser() user: JwtPayload) {
    return this.forms.create(user.orgId, user.sub, body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.forms.update(id, user.orgId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.forms.remove(id, user.orgId);
  }
}
