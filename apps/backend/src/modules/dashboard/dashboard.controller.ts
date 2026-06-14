import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

const parseDateRange = (from?: string, to?: string, defaultDays = 30) => ({
  fromDate: from ? new Date(from) : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000),
  toDate:   to   ? new Date(to)   : new Date(),
});

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getAdmin(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const { fromDate, toDate } = parseDateRange(from, to);
    return this.dashboard.getAdminStats(user.orgId, fromDate, toDate);
  }

  @Get('cm')
  @Roles(UserRole.CASE_MANAGER)
  getCM(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const { fromDate, toDate } = parseDateRange(from, to);
    return this.dashboard.getCMStats(user.sub, user.orgId, fromDate, toDate);
  }

  @Get('fw')
  @Roles(UserRole.CARE_GIVER)
  getFW(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const { fromDate, toDate } = parseDateRange(from, to);
    return this.dashboard.getFWStats(user.sub, user.orgId, fromDate, toDate);
  }

  @Get('medvol')
  @Roles(UserRole.MEDICAL_VOLUNTEER)
  getMedVol(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const { fromDate, toDate } = parseDateRange(from, to);
    return this.dashboard.getMedVolStats(user.orgId, fromDate, toDate);
  }

  @Get('kpi')
  @Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getKpi(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getKpiSettings(user.orgId);
  }

  @Patch('kpi')
  @Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateKpi(@CurrentUser() user: JwtPayload, @Body() body: { followUp?: number; medication?: number; completion?: number }) {
    return this.dashboard.updateKpiSettings(user.orgId, body);
  }
}
