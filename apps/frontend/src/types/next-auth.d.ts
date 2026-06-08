import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string | null;
  }
  interface User {
    accessToken?: string;
    refreshToken?: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: string;
    displayName?: string;
    avatarUrl?: string | null;
    error?: 'RefreshAccessTokenError';
  }
}
