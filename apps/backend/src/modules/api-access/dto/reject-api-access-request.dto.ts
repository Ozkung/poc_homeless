import { IsOptional, IsString } from 'class-validator';

export class RejectApiAccessRequestDto {
  @IsOptional() @IsString() reason?: string;
}
