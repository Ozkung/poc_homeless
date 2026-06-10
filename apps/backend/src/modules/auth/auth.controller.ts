import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Patch, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { Res, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const avatarStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'avatars'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // ── Public auth ────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { ttl: 900000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, role } = await this.auth.login(dto.email, dto.password);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string = req.cookies?.[COOKIE_NAME] ?? '';
    const { accessToken, refreshToken, role } = await this.auth.refresh(token);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async logout(@Res({ passthrough: true }) res: Response, @Body('refreshToken') bodyToken?: string) {
    await this.auth.logout(bodyToken ?? '');
    res.clearCookie(COOKIE_NAME);
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  setup(@Body() dto: SetupDto) {
    return this.auth.setup(dto.orgName, dto.adminName, dto.adminEmail, dto.adminPassword);
  }

  @Post('liff/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  liffVerify(@Body('idToken') idToken: string) {
    console.log('LIFF verify called with idToken:', idToken);
    if (!idToken) throw new BadRequestException('idToken is required');
    return this.auth.verifyLiffToken(idToken);
  }

  // ── Profile (me) ───────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.auth.getMe(user.sub, user.orgId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: JwtPayload) {
    return this.auth.updateMe(user.sub, user.orgId, dto);
  }

  @Post('me/change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtPayload) {
    return this.auth.changePassword(user.sub, user.orgId, dto.currentPassword, dto.newPassword);
  }

  @Delete('me/line')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkLine(@CurrentUser() user: JwtPayload) {
    return this.auth.unlinkLine(user.sub, user.orgId);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', {
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('ไฟล์ต้องเป็น jpg/png/webp และไม่เกิน 2MB'), false);
    },
  }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.auth.saveAvatarUrl(user.sub, user.orgId, avatarUrl);
  }
}
