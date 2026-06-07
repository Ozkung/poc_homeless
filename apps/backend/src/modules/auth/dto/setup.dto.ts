import { IsEmail, IsString, MinLength } from 'class-validator';

export class SetupDto {
  @IsString()
  @MinLength(2)
  orgName!: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;
}
