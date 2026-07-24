import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ApiAccessService } from './api-access.service';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';
import { ApproveApiAccessRequestDto } from './dto/approve-api-access-request.dto';
import { RejectApiAccessRequestDto } from './dto/reject-api-access-request.dto';

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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query('status') status?: string) {
    return this.apiAccess.findAll(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.apiAccess.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @Body() dto: ApproveApiAccessRequestDto, @CurrentUser() user: JwtPayload) {
    return this.apiAccess.approve(id, user.sub, dto);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  reject(@Param('id') id: string, @Body() dto: RejectApiAccessRequestDto, @CurrentUser() user: JwtPayload) {
    return this.apiAccess.reject(id, user.sub, dto);
  }

  @Patch('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('manual', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'api-access'),
        filename: (_req, _file, cb) => cb(null, 'manual.pdf'),
      }),
      limits: { fileSize: MAX_JUSTIFICATION_SIZE },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new BadRequestException('รองรับเฉพาะไฟล์ PDF'), false);
        }
      },
    }),
  )
  async uploadManual(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์คู่มือ');
    return this.apiAccess.uploadManual(`/uploads/api-access/manual.pdf`);
  }
}
