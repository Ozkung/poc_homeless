import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import configuration, { validationSchema } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { FormsModule } from './modules/forms/forms.module';
import { EventsModule } from './modules/events/events.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { LineModule } from './modules/line/line.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AlertsModule } from './modules/alerts/alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: 'single',
        url: process.env.REDIS_URL,
      }),
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env.REDIS_URL ?? 'redis://localhost:6379',
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    FormsModule,
    EventsModule,
    TasksModule,
    SubmissionsModule,
    LineModule,
    NotificationsModule,
    AlertsModule,
  ],
})
export class AppModule {}
