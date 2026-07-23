import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ExpensePayeeType } from '@prisma/client';

export class CreateExpenseClaimDto {
  @IsDateString() requestDate: string;
  @IsNumber() @IsPositive() amount: number;
  @IsString() @IsNotEmpty() description: string;
  @IsOptional() @IsString() additionalNote?: string;
  @IsEnum(ExpensePayeeType) payeeType: ExpensePayeeType;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() payeeId?: string;
}
