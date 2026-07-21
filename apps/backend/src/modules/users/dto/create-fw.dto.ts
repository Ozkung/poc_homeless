import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFwDto {
  @IsEmail() email: string;
  @IsString() displayName: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() address?: string;
}
