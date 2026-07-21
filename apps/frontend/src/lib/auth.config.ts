import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

function decodeJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp * 1000;
  } catch {
    return Date.now() + 14 * 60 * 1000;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token.refreshToken}` },
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    const newRefreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1];
    return {
      ...token,
      accessToken: data.accessToken,
      refreshToken: newRefreshToken ?? token.refreshToken,
      accessTokenExpires: decodeJwtExpiry(data.accessToken),
      displayName: data.displayName ?? token.displayName,
      avatarUrl: data.avatarUrl ?? token.avatarUrl,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          // Extract refreshToken from the HttpOnly cookie set by the backend
          const refreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1];
          return { id: 'user', ...data, refreshToken };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          accessToken: user.accessToken,
          refreshToken: (user as any).refreshToken,
          accessTokenExpires: decodeJwtExpiry(user.accessToken!),
          role: user.role,
          displayName: (user as any).displayName,
          avatarUrl: (user as any).avatarUrl ?? null,
        };
      }

      // Token still valid (with 60s buffer before expiry)
      if (Date.now() < (token.accessTokenExpires ?? 0) - 60_000) {
        return token;
      }

      // Access token expired — use refreshToken to get a new one
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.error ? undefined : token.accessToken;
      session.role = token.role;
      session.displayName = token.displayName as string | undefined;
      session.avatarUrl = token.avatarUrl as string | null | undefined;
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};
