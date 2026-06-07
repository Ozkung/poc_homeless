import {
  Controller, Post, Body, Res, Req, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

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
    const token: string = bodyToken ?? '';
    await this.auth.logout(token);
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
    if (!idToken) throw new BadRequestException('idToken is required');
    return this.auth.verifyLiffToken(idToken);
  }
}
