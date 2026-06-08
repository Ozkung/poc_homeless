import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class AdjRequestDto {
  @IsInt() quantity: number;
  @IsString() @IsNotEmpty() reason: string;
}
