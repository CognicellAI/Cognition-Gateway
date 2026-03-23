import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "@/lib/db/client";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Credentials provider requires JWT strategy — database sessions are
  // incompatible with Credentials in Auth.js v5.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const normalizedEmail = email.trim().toLowerCase();

        const user = await db.user.findUnique({ where: { email: normalizedEmail } });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Custom fields carried in the JWT
          role: user.role,
          serverUrl: user.serverUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, persist custom fields into the JWT
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.serverUrl =
          (user as { serverUrl?: string }).serverUrl ?? "http://localhost:8000";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.serverUrl = token.serverUrl as string;
      }
      return session;
    },
  },
});
