import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  controllers: [ReportsController],
  providers:   [ReportsService, AesGcmService],
})
export class ReportsModule {}
