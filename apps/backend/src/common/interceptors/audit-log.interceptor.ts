import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityType } from '@prisma/client';

const METHOD_TO_TYPE: Record<string, ActivityType> = {
  GET: ActivityType.CHECK_IN,
  POST: ActivityType.FORM_SUBMIT,
  PATCH: ActivityType.STATUS_CHANGE,
  PUT: ActivityType.STATUS_CHANGE,
  DELETE: ActivityType.STATUS_CHANGE,
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    return next.handle().pipe(
      tap(async () => {
        if (!user?.sub) return;
        try {
          await this.prisma.activity.create({
            data: {
              actorId: user.sub,
              type: METHOD_TO_TYPE[request.method] ?? ActivityType.STATUS_CHANGE,
              payload: {
                method: request.method,
                path: request.path,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
              },
            },
          });
        } catch {
          // Audit log failure must never break the request
        }
      }),
    );
  }
}
