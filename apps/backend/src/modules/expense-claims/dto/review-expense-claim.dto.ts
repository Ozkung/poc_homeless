import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewExpenseClaimDto {
  @IsEnum(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewNote?: string;
}
