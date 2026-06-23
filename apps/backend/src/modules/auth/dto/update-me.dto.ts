import { IsEmail, IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateMeDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() currentPassword?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsISO8601({ strict: true }) birthDate?: string;
  @IsOptional() @IsString() preferredZoneId?: string;
}
