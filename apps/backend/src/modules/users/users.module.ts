import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [AuditLogModule, LineModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
