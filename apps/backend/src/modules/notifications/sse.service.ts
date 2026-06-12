// apps/backend/src/modules/notifications/sse.service.ts
import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class SseService {
  private subjects = new Map<string, Subject<SseEvent>>();

  private key(orgId: string, role: string) {
    return `${orgId}:${role}`;
  }

  getSubject(orgId: string, role: string): Subject<SseEvent> {
    const k = this.key(orgId, role);
    if (!this.subjects.has(k)) {
      this.subjects.set(k, new Subject<SseEvent>());
    }
    return this.subjects.get(k)!;
  }

  emit(orgId: string, roles: string[], event: SseEvent) {
    for (const role of roles) {
      this.subjects.get(this.key(orgId, role))?.next(event);
    }
  }
}
