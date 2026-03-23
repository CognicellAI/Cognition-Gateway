/**
 * Artifact extraction utilities.
 *
 * Detects artifact candidates in agent message content:
 * - Fenced code blocks >= MIN_CODE_LINES lines
 * - Named files (```filename.ext or ```lang filename.ext)
 *
 * Returns a list of extracted artifacts without side effects.
 */

export interface ExtractedArtifact {
  label: string;
  content: string;
  language?: string;
}

const MIN_CODE_LINES = 8;

// Matches ```[lang] [filename?]\n...\n```
const FENCED_CODE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

/**
 * Extract artifact candidates from a markdown string.
 */
export function extractArtifacts(markdown: string): ExtractedArtifact[] {
  const results: ExtractedArtifact[] = [];
  let match: RegExpExecArray | null;

  FENCED_CODE_RE.lastIndex = 0;
  while ((match = FENCED_CODE_RE.exec(markdown)) !== null) {
    const meta = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    const lines = body.split("\n").filter((l) => l.trim() !== "");

    if (lines.length < MIN_CODE_LINES) continue;

    // Parse: ```python filename.py  OR  ```filename.py  OR  ```python
    let language: string | undefined;
    let label: string;

    const parts = meta.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      language = undefined;
      label = `code block`;
    } else if (parts.length === 1) {
      // Could be a language or a filename
      if (parts[0].includes(".")) {
        label = parts[0];
        language = inferLanguage(parts[0]);
      } else {
        language = parts[0];
        label = `${parts[0]} block`;
      }
    } else {
      // First token is language, second is filename
      language = parts[0];
      label = parts[1];
    }

    results.push({ label, content: body, language });
  }

  return results;
}

function inferLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    html: "html",
    css: "css",
  };
  return ext ? map[ext] : undefined;
}
