import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { isAllowedPath } from "@/lib/gateway/proxy";
import { db } from "@/lib/db/client";
import { verifyApiKey } from "@/lib/auth/api-keys";
import { audit, getIp } from "@/lib/gateway/audit";

interface ResolvedIdentity {
  userId: string;
  serverUrl: string;
}

/**
 * Resolve the caller's identity from either a session cookie or a
 * `Authorization: Bearer <key>` header.
 */
async function resolveIdentity(
  request: NextRequest,
): Promise<ResolvedIdentity | null> {
  // 1. Try session cookie (standard browser flow)
  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      serverUrl: session.user.serverUrl ?? "http://localhost:8000",
    };
  }

  // 2. Try Bearer token (API key flow)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const fullKey = authHeader.slice(7).trim();
    if (!fullKey.startsWith("cgw_")) return null;

    // Look up by prefix to narrow candidates (prefix is not secret,
    // but avoids a full-table scan on the hash)
    const prefix = fullKey.slice(0, 12);
    const candidates = await db.apiKey.findMany({
      where: { keyPrefix: prefix },
      include: { user: { select: { id: true, serverUrl: true } } },
    });

    for (const candidate of candidates) {
      // Skip expired keys
      if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;

      const valid = await verifyApiKey(fullKey, candidate.keyHash);
      if (valid) {
        // Update lastUsedAt asynchronously
        void db.apiKey
          .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);

        return {
          userId: candidate.user.id,
          serverUrl: candidate.user.serverUrl,
        };
      }
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyRequest(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxyRequest(request, await params);
}

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] }
): Promise<Response> {
  // 1. Authenticate (session cookie or Bearer API key)
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pathSegments = params.path ?? [];

  // 2. Allowlist check
  if (!isAllowedPath(pathSegments)) {
    return NextResponse.json(
      { error: "Forbidden: path not allowed", code: "PATH_NOT_ALLOWED" },
      { status: 403 }
    );
  }

  // 3. Build target URL
  const serverUrl = identity.serverUrl;
  const cognitionPath = pathSegments.join("/");
  const search = request.nextUrl.search;
  const targetUrl = `${serverUrl}/${cognitionPath}${search}`;

  // 4. Forward headers (filter hop-by-hop)
  const forwardHeaders = new Headers();
  const skipHeaders = new Set([
    "host",
    "connection",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
  ]);

  request.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  // 5. Inject scope header for multi-tenant isolation
  forwardHeaders.set("x-cognition-scope-user", identity.userId);

  // 6. Forward request body for non-GET methods
  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.text()
      : undefined;

  // 7. Proxy to Cognition
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: body || undefined,
      // @ts-expect-error -- Node.js fetch supports duplex
      duplex: "half",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to reach Cognition server",
        code: "UPSTREAM_UNREACHABLE",
        details: message,
      },
      { status: 502 }
    );
  }

  // 8. SSE pass-through — pipe stream without buffering
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const responseHeaders = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  // 9. Regular JSON response — forward as-is
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // 10. Audit significant mutations
  const cognitionPathStr = pathSegments.join("/");
  if (upstream.ok) {
    if (request.method === "PATCH" && cognitionPathStr === "config") {
      void audit({
        userId: identity.userId,
        action: "config.patch",
        ip: getIp(request),
      });
    } else if (request.method === "POST" && cognitionPathStr === "config/rollback") {
      void audit({
        userId: identity.userId,
        action: "config.rollback",
        ip: getIp(request),
      });
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}