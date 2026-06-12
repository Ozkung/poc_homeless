import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateDiagnosisDto, CreatePrescriptionDto, CreateScheduleDto } from './dto/doctor.dto';

const DOCTOR_ROLES = [UserRole.DOCTOR];
const ALL_ROLES = [UserRole.DOCTOR, UserRole.CASE_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MEDICAL_VOLUNTEER, UserRole.CARE_GIVER, UserRole.GUEST];

@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorController {
  constructor(private doctor: DoctorService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────
  @Get('dashboard')
  @Roles(...DOCTOR_ROLES)
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.doctor.getDashboard(user.orgId);
  }

  // ── Patients ─────────────────────────────────────────────────────────
  @Get('patients')
  @Roles(...DOCTOR_ROLES)
  getPatients(@CurrentUser() user: JwtPayload) {
    return this.doctor.getPatients(user.orgId);
  }

  @Get('patients/:id')
  @Roles(...DOCTOR_ROLES)
  getPatient(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.doctor.getPatient(id, user.orgId);
  }

  // ── Diagnosis (read: all roles) ────────────────────────────────────────
  @Get('patients/:id/diagnoses')
  @Roles(...ALL_ROLES)
  getDiagnoses(@Param('id') id: string) {
    return this.doctor.getDiagnoses(id);
  }

  @Post('patients/:id/diagnoses')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...DOCTOR_ROLES)
  createDiagnosis(@Param('id') id: string, @Body() dto: CreateDiagnosisDto, @CurrentUser() user: JwtPayload) {
    return this.doctor.createDiagnosis(id, user.sub, dto);
  }

  @Patch('patients/:patientId/diagnoses/:diagId')
  @Roles(...DOCTOR_ROLES)
  updateDiagnosis(@Param('diagId') diagId: string, @Body() dto: CreateDiagnosisDto, @CurrentUser() user: JwtPayload) {
    return this.doctor.updateDiagnosis(diagId, user.sub, dto);
  }

  @Delete('patients/:patientId/diagnoses/:diagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...DOCTOR_ROLES)
  deleteDiagnosis(@Param('diagId') diagId: string, @CurrentUser() user: JwtPayload) {
    return this.doctor.deleteDiagnosis(diagId, user.sub);
  }

  // ── Prescription (read: all roles) ────────────────────────────────────
  @Get('patients/:id/prescriptions')
  @Roles(...ALL_ROLES)
  getPrescriptions(@Param('id') id: string) {
    return this.doctor.getPrescriptions(id);
  }

  @Post('patients/:id/prescriptions')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...DOCTOR_ROLES)
  createPrescription(@Param('id') id: string, @Body() dto: CreatePrescriptionDto, @CurrentUser() user: JwtPayload) {
    return this.doctor.createPrescription(id, user.sub, dto);
  }

  // ── Schedule (read: all roles) ────────────────────────────────────────
  @Get('schedules')
  @Roles(...ALL_ROLES)
  getSchedules(@CurrentUser() user: JwtPayload) {
    return this.doctor.getSchedules(user.orgId);
  }

  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...DOCTOR_ROLES)
  createSchedule(@Body() dto: CreateScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.doctor.createSchedule(user.sub, user.orgId, dto);
  }

  @Patch('schedules/:id')
  @Roles(...DOCTOR_ROLES)
  updateSchedule(@Param('id') id: string, @Body() dto: CreateScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.doctor.updateSchedule(id, user.sub, dto);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...DOCTOR_ROLES)
  deleteSchedule(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.doctor.deleteSchedule(id, user.sub);
  }
}
