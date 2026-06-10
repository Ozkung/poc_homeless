import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpsertCarePlanAssessmentDto {
  @IsOptional() @IsString() assessmentDate?: string;
  @IsOptional() @IsString() locationFound?: string;
  @IsOptional() @IsString() careSetting?: string;
  @IsOptional() @IsString() referralSource?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() helpGoal?: string;
  @IsOptional() @IsString() homelessType?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() healthcareRight?: string;
  @IsOptional() @IsString() primaryCareUnit?: string;
  @IsOptional() @IsString() referralUnit?: string;

  @IsOptional() @IsArray() ncdConditions?: string[];
  @IsOptional() @IsArray() infectiousConditions?: string[];
  @IsOptional() @IsArray() mentalConditions?: string[];
  @IsOptional() @IsArray() substanceConditions?: string[];
  @IsOptional() @IsArray() disabilityConditions?: string[];
  @IsOptional() @IsArray() otherConditionCategories?: string[];
  @IsOptional() @IsString() conditionNote?: string;
  @IsOptional() @IsString() mentalConditionNote?: string;

  @IsOptional() @IsArray() medicalGoals?: string[];
  @IsOptional() @IsString() medicalGoalOther?: string;
  @IsOptional() @IsArray() socialGoals?: string[];
  @IsOptional() @IsString() socialGoalOther?: string;
}
