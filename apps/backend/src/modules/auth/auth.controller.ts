import {
  Controller, Post, Body, Res, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

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
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string = req.cookies?.[COOKIE_NAME] ?? '';
    const { accessToken, refreshToken, role } = await this.auth.refresh(token);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    return { accessToken, role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) res: Response, @Body('refreshToken') bodyToken?: string) {
    const token: string = bodyToken ?? '';
    await this.auth.logout(token);
    res.clearCookie(COOKIE_NAME);
  }

  @Post('liff/verify')
  @HttpCode(HttpStatus.OK)
  liffVerify(@Body('idToken') idToken: string) {
    return this.auth.verifyLiffToken(idToken);
  }
}
