// Allowed Cognition paths that the proxy will forward.
// Any request to a path not matching this set is rejected with 403.
export const ALLOWED_PATHS = new Set([
  "health",
  "ready",
  "sessions",
  "agents",
  "models",
  "config",
  "tools",
  "skills",
]);

// Prefix patterns (checked with startsWith after the first segment)
export const ALLOWED_PREFIXES = [
  "sessions/",
  "agents/",
  "models/",
  "config/",
  "tools/",
  "skills/",
];

export function isAllowedPath(pathSegments: string[]): boolean {
  if (pathSegments.length === 0) return false;

  const fullPath = pathSegments.join("/");

  // Exact match
  if (ALLOWED_PATHS.has(fullPath)) return true;

  // Prefix match
  for (const prefix of ALLOWED_PREFIXES) {
    if (fullPath.startsWith(prefix)) return true;
  }

  return false;
}