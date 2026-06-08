import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { InventoryCategory } from '@prisma/client';

export class CreateItemDto {
  @IsString() name: string;
  @IsString() unit: string;
  @IsEnum(InventoryCategory) category: InventoryCategory;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
}
