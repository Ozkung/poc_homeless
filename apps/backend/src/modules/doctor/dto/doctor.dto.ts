import { IsString, IsOptional, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDiagnosisDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsString() icd10?: string;
  @IsOptional() @IsString() severity?: string;
}

export class MedicationItemDto {
  @IsString() name: string;
  @IsString() dosage: string;
  @IsString() frequency: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePrescriptionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => MedicationItemDto)
  medications: MedicationItemDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateScheduleDto {
  @IsDateString() date: string;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() notes?: string;
}
