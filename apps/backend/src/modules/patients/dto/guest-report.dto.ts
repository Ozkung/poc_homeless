import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Gender } from '@prisma/client';

export class GuestReportDto {
  @IsString()
  alias: string;

  @IsString()
  locationText: string;

  @IsString()
  initialComplaint: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;
}
