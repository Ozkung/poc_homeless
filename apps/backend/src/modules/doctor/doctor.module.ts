import { Module } from '@nestjs/common';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';

@Module({
  imports: [PrismaModule],
  controllers: [DoctorController],
  providers: [DoctorService, AesGcmService],
})
export class DoctorModule {}
