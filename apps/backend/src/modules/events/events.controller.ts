import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN)
export class EventsController {
  constructor(private events: EventsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('month') month?: string, @Query('year') year?: string) {
    return this.events.findAll(user.orgId, month ? +month : undefined, year ? +year : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.events.findOne(id, user.orgId);
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.events.create(user.orgId, user.sub, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.events.update(id, user.orgId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.events.remove(id, user.orgId, user.sub);
  }
}
