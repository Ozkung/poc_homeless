import { IsNotEmpty, IsString } from 'class-validator';

export class HandoffExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
