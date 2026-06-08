import { IsEnum, IsInt, IsOptional, IsString, Min, IsNumber } from 'class-validator';

export class StockInDto {
  @IsEnum(['IN_PURCHASE', 'IN_DONATION']) type: 'IN_PURCHASE' | 'IN_DONATION';
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() donorName?: string;
  @IsOptional() @IsString() receiptNo?: string;
  @IsOptional() @IsNumber() unitCost?: number;
}
