import { Module, forwardRef } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { TasksModule } from '../tasks/tasks.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, AesGcmService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
