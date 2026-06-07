import { IsNumber, IsOptional } from 'class-validator';

export class SosDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
