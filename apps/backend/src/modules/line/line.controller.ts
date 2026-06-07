import { Controller, Post, Param, Body, Headers, RawBodyRequest, Req, UnauthorizedException, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { LineService } from './line.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('line')
export class LineController {
  constructor(
    private line: LineService,
    private tasks: TasksService,
    private notifications: NotificationsService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('x-line-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !this.line.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Line signature');
    }
    // Process events asynchronously (fire-and-forget)
    this.processEvents(body.events ?? []).catch(() => {});
    return { status: 'ok' };
  }

  @Post('notify/:taskId')
  @UseGuards(JwtAuthGuard)
  async notify(@Param('taskId') taskId: string, @CurrentUser() _user: JwtPayload) {
    const task = await this.tasks.findOne(taskId);
    const token = await this.tasks.generateLiffToken(taskId);
    if (task.assignee?.lineUserId) {
      await this.notifications.enqueueTaskNotification({
        lineUserId: task.assignee.lineUserId,
        taskId: task.id,
        title: (task.event as any)?.title ?? 'งานใหม่',
        patientName: 'ผู้ป่วย',
        token,
      });
    }
    return { sent: !!task.assignee?.lineUserId, token };
  }

  private async processEvents(events: any[]) {
    for (const event of events) {
      if (event.type === 'follow') {
        // TODO: Link Line user to system account via OTP flow
      }
    }
  }
}
