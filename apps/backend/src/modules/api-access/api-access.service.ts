import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { API_ACCESS_CATALOG, isValidScope } from './column-catalog';
import { CreateApiAccessRequestDto } from './dto/create-api-access-request.dto';

@Injectable()
export class ApiAccessService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

  getCatalog(): Record<string, string[]> {
    return API_ACCESS_CATALOG;
  }

  private parseAndValidateScope(raw: string): Record<string, string[]> {
    let scope: Record<string, string[]>;
    try {
      scope = JSON.parse(raw);
    } catch {
      throw new BadRequestException('รูปแบบข้อมูลที่ขอเข้าถึงไม่ถูกต้อง');
    }
    if (!isValidScope(scope)) {
      throw new BadRequestException('ข้อมูลหรือคอลัมน์ที่ขอเข้าถึงไม่ถูกต้อง');
    }
    return scope;
  }

  async create(dto: CreateApiAccessRequestDto, justificationFileUrl: string) {
    const requestedScope = this.parseAndValidateScope(dto.requestedScope);

    return this.prisma.apiAccessRequest.create({
      data: {
        requesterName: dto.requesterName,
        requesterOrg: dto.requesterOrg,
        email: dto.email,
        phone: dto.phone,
        justificationFileUrl,
        requestedLevel: dto.requestedLevel,
        requestedScope,
      },
    });
  }
}
