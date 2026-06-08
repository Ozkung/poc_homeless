import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewAdjDto {
  @IsEnum(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewNote?: string;
}
