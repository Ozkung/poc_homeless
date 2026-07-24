import { Module } from '@nestjs/common';
import { ApiAccessService } from './api-access.service';
import { ApiAccessController } from './api-access.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [ApiAccessController],
  providers: [ApiAccessService],
})
export class ApiAccessModule {}
