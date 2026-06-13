import { Module, forwardRef } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  imports: [forwardRef(() => SubmissionsModule)],
  controllers: [TasksController],
  providers: [TasksService, AesGcmService],
  exports: [TasksService],
})
export class TasksModule {}
