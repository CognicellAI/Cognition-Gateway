/**
 * Edge-compatible Auth.js configuration for use in middleware only.
 * Must NOT import any Node.js-only modules (Prisma, bcrypt, better-sqlite3).
 * The full auth config with database adapter lives in src/lib/auth/config.ts.
 */
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Public paths that don't require auth
      const isPublicPath =
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/setup") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/setup") ||
        pathname.startsWith("/api/hooks/") || // Webhook ingress — called by external systems
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";

      if (isPublicPath) return true;
      if (isLoggedIn) return true;

      // Redirect to login
      return false;
    },
  },
  providers: [], // Providers are added in the full config; not needed for edge auth check
};

export const { auth: middleware } = NextAuth(authConfig);
