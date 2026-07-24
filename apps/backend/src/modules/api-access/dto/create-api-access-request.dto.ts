import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiAccessLevel } from '@prisma/client';

export class CreateApiAccessRequestDto {
  @IsString() @IsNotEmpty() requesterName: string;
  @IsOptional() @IsString() requesterOrg?: string;
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsEnum(ApiAccessLevel) requestedLevel: ApiAccessLevel;
  // JSON-encoded Record<string, string[]> — multipart form fields arrive as strings;
  // parsed and validated against the catalog in ApiAccessService.create().
  @IsString() @IsNotEmpty() requestedScope: string;
}
