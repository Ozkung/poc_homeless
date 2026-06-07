import { IsString, IsArray, IsNotEmpty } from 'class-validator';

export class SubmitTaskDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsArray()
  answers: { fieldId: string; value: unknown }[];
}
