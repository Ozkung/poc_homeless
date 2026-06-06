import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, AesGcmService],
})
export class PatientsModule {}
