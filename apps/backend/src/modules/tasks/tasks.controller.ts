import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

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
}
