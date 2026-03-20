export { middleware as proxy } from "@/lib/auth/edge-config";

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
