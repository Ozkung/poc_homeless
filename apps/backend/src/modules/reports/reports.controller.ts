import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('monthly')
  getMonthly(
    @Query('month') month: string,
    @Query('year')  year:  string,
    @CurrentUser()  user:  JwtPayload,
  ) {
    const now = new Date();
    return this.reports.getMonthly(
      user.orgId,
      month ? parseInt(month, 10) : now.getMonth() + 1,
      year  ? parseInt(year,  10) : now.getFullYear(),
    );
  }
}
