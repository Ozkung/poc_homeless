import { Module, forwardRef } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TasksModule, forwardRef(() => NotificationsModule)],
  controllers: [LineController],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
