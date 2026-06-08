import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DeductDto {
  @IsInt() @Min(1) quantity: number;
  @IsEnum(['OUT_PRESCRIPTION', 'OUT_SUPPLY']) type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY';
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() eventId?: string;
}
