import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Trust the nginx reverse proxy's X-Forwarded-For (exactly one hop) so
  // req.ip reflects the real client IP instead of nginx's container IP —
  // required for per-IP rate limiting (ThrottlerGuard) to actually work.
  app.set('trust proxy', 1);

  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [process.env.FRONTEND_URL ?? 'http://localhost:3000'],
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Audit log interceptor (needs PrismaService)
  const prisma = app.get(PrismaService);
  app.useGlobalInterceptors(new AuditLogInterceptor(prisma));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 HomeMed Connect API running on port ${port}`);
}
bootstrap();
