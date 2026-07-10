import { Controller, Get, Query, Req, Sse, UnauthorizedException, MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable, Subject, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { SseService, SseEvent } from './sse.service';

@Controller('notifications')
export class SseController {
  constructor(
    private sseService: SseService,
    private jwt: JwtService,
  ) {}

  @Get('stream')
  @Sse()
  stream(@Query('token') token: string, @Req() req: Request): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException('Token required');

    let payload: { sub: string; orgId: string; role: string };
    try {
      payload = this.jwt.verify(token) as any;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const allowed = ['CASE_MANAGER', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowed.includes(payload.role)) {
      throw new UnauthorizedException('Role not permitted for notifications');
    }

    const subject = this.sseService.getSubject(payload.orgId, payload.role);
    const destroy$ = new Subject<void>();

    req.on('close', () => { destroy$.next(); destroy$.complete(); });

    const events$ = subject.pipe(
      map((event: SseEvent) => ({ data: JSON.stringify(event) } as MessageEvent)),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(() => ({ data: ':ping' } as MessageEvent)),
    );

    return merge(events$, heartbeat$).pipe(takeUntil(destroy$));
  }
}
