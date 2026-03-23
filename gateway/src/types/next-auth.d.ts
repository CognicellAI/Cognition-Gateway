// Extend next-auth types
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      serverUrl: string;
    } & DefaultSession["user"];
  }
}