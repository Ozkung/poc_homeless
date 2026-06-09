import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateZoneDto {
  @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @IsOptional() @IsString()
  description?: string | null;

  @IsOptional() @IsString()
  color?: string;
}
