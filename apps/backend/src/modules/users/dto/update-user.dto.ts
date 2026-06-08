import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole, Gender } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
