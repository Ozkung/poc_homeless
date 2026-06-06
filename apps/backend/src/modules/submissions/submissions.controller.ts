import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private submissions: SubmissionsService) {}

  @Post()
  create(@Body() body: { taskId: string; token: string; answers: any[] }, @CurrentUser() user: JwtPayload) {
    return this.submissions.create(user.sub, body);
  }

  @Get('task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.submissions.findByTask(taskId);
  }
}
