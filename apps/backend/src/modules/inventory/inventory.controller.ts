import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Patch,
  Post, Query, UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { StockInDto } from './dto/stock-in.dto';
import { DeductDto } from './dto/deduct.dto';
import { AdjRequestDto } from './dto/adj-request.dto';
import { ReviewAdjDto } from './dto/review-adj.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  listItems(@CurrentUser() user: JwtPayload, @Query('category') category?: string) {
    return this.inventory.listItems(user.orgId, category);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createItem(user.orgId, dto);
  }

  @Get('low-stock')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  getLowStock(@CurrentUser() user: JwtPayload) {
    return this.inventory.getLowStockItems(user.orgId);
  }

  @Get('adj-requests')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  getPendingAdj(@CurrentUser() user: JwtPayload) {
    return this.inventory.getPendingAdj(user.orgId);
  }

  @Patch('adj-requests/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  reviewAdj(
    @Param('id') id: string,
    @Body() dto: ReviewAdjDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventory.reviewAdj(id, user.sub, user.orgId, dto);
  }

  @Get('expiring')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  getExpiring(@CurrentUser() user: JwtPayload) {
    return this.inventory.getExpiringLots(user.orgId);
  }

  @Post('lots/:lotId/expire')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  @HttpCode(HttpStatus.NO_CONTENT)
  expireLot(@Param('lotId') lotId: string, @CurrentUser() user: JwtPayload) {
    return this.inventory.expireLot(lotId, user.sub, user.orgId);
  }

  @Get(':id/lots')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  getLots(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inventory.getLots(id, user.orgId);
  }

  @Get(':id/transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  getTransactionHistory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inventory.getTransactionHistory(id, user.orgId);
  }

  @Post(':id/stock-in')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  @HttpCode(HttpStatus.CREATED)
  stockIn(@Param('id') id: string, @Body() dto: StockInDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.stockIn(id, user.orgId, user.sub, dto);
  }

  @Post(':id/deduct')
  @Roles(UserRole.ADMIN, UserRole.MEDICAL_VOLUNTEER)
  @HttpCode(HttpStatus.OK)
  deduct(@Param('id') id: string, @Body() dto: DeductDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.deduct(id, dto.quantity, {
      actorId: user.sub, type: dto.type,
      patientId: dto.patientId, eventId: dto.eventId, orgId: user.orgId,
    });
  }

  @Post(':id/adj-request')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER)
  @HttpCode(HttpStatus.CREATED)
  requestAdj(@Param('id') id: string, @Body() dto: AdjRequestDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.requestAdj(id, user.orgId, user.sub, dto);
  }
}
