import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { SosDto } from './dto/sos.dto';
import { UpsertCarePlanAssessmentDto } from './dto/care-plan-assessment.dto';
import { GuestReportDto } from './dto/guest-report.dto';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.CARE_GIVER, UserRole.MEDICAL_VOLUNTEER)
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.patients.findAll(user.orgId, user.role, user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findOne(id, user.orgId);
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.patients.create(user.orgId, user.sub, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.patients.update(id, user.orgId, body);
  }

  @Patch(':id/status')
  @Roles(UserRole.CASE_MANAGER, UserRole.DOCTOR)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.update(id, user.orgId, { status });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.remove(id, user.orgId);
  }

  @Get(':id/activities')
  @Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.CARE_GIVER, UserRole.MEDICAL_VOLUNTEER, UserRole.DOCTOR)
  findActivities(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findActivities(id, user.orgId);
  }

  @Get(':id/submissions')
  @Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.CARE_GIVER, UserRole.MEDICAL_VOLUNTEER, UserRole.DOCTOR)
  findSubmissions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.findSubmissions(id, user.orgId);
  }

  @Get(':id/care-plan')
  getCarePlan(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patients.getCarePlan(id, user.orgId);
  }

  @Post(':id/care-plan')
  @HttpCode(HttpStatus.CREATED)
  addCarePlanItem(
    @Param('id') id: string,
    @Body() body: { title: string; frequency: string; priority: string; assigneeName?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.addCarePlanItem(id, user.orgId, user.sub, body);
  }

  @Patch(':id/care-plan/:itemId')
  updateCarePlanItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Partial<{ title: string; frequency: string; priority: string; assigneeName: string; isDone: boolean }>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.updateCarePlanItem(id, itemId, user.orgId, body);
  }

  @Delete(':id/care-plan/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCarePlanItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.deleteCarePlanItem(id, itemId, user.orgId);
  }

  @Get(':id/assessment')
  @Roles(UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.CARE_GIVER, UserRole.MEDICAL_VOLUNTEER, UserRole.DOCTOR)
  listCarePlanAssessments(
    @Param('id') id: string,
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.listCarePlanAssessments(
      id, user.orgId,
      skip ? parseInt(skip, 10) : 0,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get(':id/assessment/:assessmentId')
  getCarePlanAssessment(
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.getCarePlanAssessment(id, assessmentId, user.orgId);
  }

  @Post(':id/assessment')
  @HttpCode(HttpStatus.CREATED)
  createCarePlanAssessment(
    @Param('id') id: string,
    @Body() dto: UpsertCarePlanAssessmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.createCarePlanAssessment(id, user.orgId, user.sub, dto);
  }

  @Patch(':id/assessment/:assessmentId')
  updateCarePlanAssessment(
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: UpsertCarePlanAssessmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.updateCarePlanAssessment(id, assessmentId, user.orgId, dto);
  }

  @Post('sos-by-task/:taskId')
  @HttpCode(HttpStatus.OK)
  createSosByTask(
    @Param('taskId') taskId: string,
    @Body() dto: SosDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.createSosByTask(taskId, user.sub, dto);
  }

  @Post(':id/sos')
  @HttpCode(HttpStatus.OK)
  createSos(
    @Param('id') id: string,
    @Body() dto: SosDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patients.createSos(id, user.orgId, user.sub, dto);
  }

  @Post('guest-report')
  @Roles(UserRole.GUEST)
  guestReport(@Body() body: GuestReportDto, @CurrentUser() user: JwtPayload) {
    return this.patients.guestReport(user.sub, user.orgId, body);
  }
}
