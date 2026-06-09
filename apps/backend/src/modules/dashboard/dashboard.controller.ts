import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAdmin(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    return this.dashboard.getAdminStats(user.orgId, fromDate, toDate);
  }

  @Get('cm')
  @Roles(UserRole.CASE_MANAGER)
  getCM(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getCMStats(user.sub, user.orgId);
  }

  @Get('fw')
  @Roles(UserRole.FIELD_WORKER)
  getFW(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getFWStats(user.sub, user.orgId);
  }

  @Get('medvol')
  @Roles(UserRole.MEDICAL_VOLUNTEER)
  getMedVol(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getMedVolStats(user.orgId);
  }
}
