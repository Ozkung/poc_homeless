import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { LineModule } from '../line/line.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    forwardRef(() => LineModule),
  ],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
