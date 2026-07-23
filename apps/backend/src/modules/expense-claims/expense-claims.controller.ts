import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ExpenseClaimsService } from './expense-claims.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateExpenseClaimDto } from './dto/create-expense-claim.dto';
import { ReviewExpenseClaimDto } from './dto/review-expense-claim.dto';

@Controller('expense-claims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpenseClaimsController {
  constructor(private claims: ExpenseClaimsService) {}

  @Post()
  @Roles(UserRole.CASE_MANAGER, UserRole.CARE_GIVER)
  create(@Body() dto: CreateExpenseClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.create(user.orgId, user.sub, user.role, dto);
  }

  @Get('mine')
  @Roles(UserRole.CASE_MANAGER, UserRole.CARE_GIVER)
  findMine(@CurrentUser() user: JwtPayload) {
    return this.claims.findMine(user.sub);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.claims.findAll(user.orgId, status);
  }

  @Patch(':id/review')
  @Roles(UserRole.SUPER_ADMIN)
  review(@Param('id') id: string, @Body() dto: ReviewExpenseClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.review(id, user.sub, user.orgId, dto);
  }
}
