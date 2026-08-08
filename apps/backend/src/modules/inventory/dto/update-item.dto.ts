import { IsString } from 'class-validator';

export class UpdateItemDto {
  @IsString() name: string;
}
