import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SubmissionsService } from '../submissions/submissions.service';
import { SubmitTaskDto } from './dto/submit-task.dto';
import { UserRole } from '@prisma/client';

const STAFF_ROLES = [
  UserRole.CARE_GIVER,
  UserRole.CASE_MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.MEDICAL_VOLUNTEER,
];

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF_ROLES)
export class TasksController {
  constructor(private tasks: TasksService, private submissions: SubmissionsService) {}

  @Get('my')
  myTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findMyTasks(user.sub);
  }

  @Get('zone')
  zoneTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findZoneTasks(user.sub, user.orgId);
  }

  @Post(':id/checkin')
  checkin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.checkin(id, user.sub);
  }

  @Post(':id/note')
  note(@Param('id') id: string, @Body('note') note: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.addNote(id, user.sub, note);
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.updateStatus(id, user.sub, status);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submissions.create(user.sub, { taskId: id, token: dto.token, answers: dto.answers });
  }

  @Get(':id/activities')
  taskActivities(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.findTaskActivities(id, user.orgId);
  }

  // ── LIFF endpoints — GUEST zone-based auth ───────────────────────────

  @Post(':id/guest-checkin')
  @Roles(UserRole.GUEST)
  guestCheckin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasks.guestCheckin(id, user.sub, user.orgId);
  }

  @Post(':id/guest-note')
  @Roles(UserRole.GUEST)
  guestNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasks.guestAddNote(id, user.sub, user.orgId, note);
  }

  @Post(':id/guest-submit')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.GUEST)
  guestSubmit(
    @Param('id') id: string,
    @Body('answers') answers: Array<{ fieldId: string; value: string }>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasks.guestSubmitForm(id, user.sub, user.orgId, answers);
  }
}
