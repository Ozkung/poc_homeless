import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiAccessLevel } from '@prisma/client';

export class ApproveApiAccessRequestDto {
  @IsOptional() @IsEnum(ApiAccessLevel) grantedLevel?: ApiAccessLevel;
  @IsOptional() @IsObject() grantedScope?: Record<string, string[]>;
}
