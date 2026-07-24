import {
  BadRequestException, Body, Controller, Get, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ApiAccessService } from './api-access.service';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';

const ALLOWED_JUSTIFICATION_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_JUSTIFICATION_SIZE = 10 * 1024 * 1024; // 10MB, matches nginx client_max_body_size

const justificationStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'api-access', 'justifications'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('api-access-requests')
export class ApiAccessController {
  constructor(private apiAccess: ApiAccessService) {}

  @Get('catalog')
  getCatalog() {
    return this.apiAccess.getCatalog();
  }

  @Post()
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @UseInterceptors(
    FileInterceptor('justificationFile', {
      storage: justificationStorage,
      limits: { fileSize: MAX_JUSTIFICATION_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_JUSTIFICATION_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('รองรับเฉพาะไฟล์ PDF, DOC, DOCX'), false);
        }
      },
    }),
  )
  async create(@Body() dto: CreateApiAccessRequestDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์ยื่นความประสงค์');
    const justificationFileUrl = `/uploads/api-access/justifications/${file.filename}`;
    const request = await this.apiAccess.create(dto, justificationFileUrl);
    return { id: request.id, status: request.status };
  }
}
