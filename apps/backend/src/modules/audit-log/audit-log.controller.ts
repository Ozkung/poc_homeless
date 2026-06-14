import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AuditLogController {
  constructor(private auditLog: AuditLogService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLog.findAll(user.orgId, Number(skip ?? 0), Number(limit ?? 50));
  }

  @Patch(':id/note')
  addNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.auditLog.addNote(id, user.orgId, note);
  }
}
