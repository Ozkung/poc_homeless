import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule, NotificationsModule],
  providers: [AlertsService, AesGcmService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
