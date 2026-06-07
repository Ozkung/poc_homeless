import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SubmissionsService } from '../submissions/submissions.service';
import { SubmitTaskDto } from './dto/submit-task.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService, private submissions: SubmissionsService) {}

  @Get('my')
  myTasks(@CurrentUser() user: JwtPayload) {
    return this.tasks.findMyTasks(user.sub);
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
}
