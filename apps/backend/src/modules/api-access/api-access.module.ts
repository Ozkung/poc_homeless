import { Module } from '@nestjs/common';
import { ApiAccessService } from './api-access.service';
import { ApiAccessController } from './api-access.controller';
import { MailModule } from '../mail/mail.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [MailModule, AuditLogModule],
  controllers: [ApiAccessController],
  providers: [ApiAccessService],
})
export class ApiAccessModule {}
