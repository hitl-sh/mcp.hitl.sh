/**
 * Works out which MCP client sent a request ("claude-code", "cursor", "chatgpt", ...) so the
 * HITL portal can show reviewers where it came from. Sent to the public API as `source`.
 *
 * The MCP endpoints run stateless, so the `initialize` handshake (which carries `clientInfo.name`)
 * and later tool calls arrive as separate HTTP requests. We remember the handshake's client name per
 * caller (Authorization header + User-Agent) in this instance's memory, and otherwise read the
 * tool call's own User-Agent.
 */

type HeaderBag =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

/** Platforms the public API accepts in `platform`. */
const API_PLATFORMS = new Set(["n8n", "zapier", "web_portal", "api", "mobile", "webhook"]);

/** Generic HTTP libraries and runtimes: a User-Agent made of these says nothing about the client. */
const GENERIC_AGENTS = new Set([
  "node", "node-fetch", "undici", "axios", "python", "python-httpx", "python-requests", "aiohttp",
  "go-http-client", "okhttp", "curl", "wget", "bun", "deno", "mozilla", "mcp", "unknown",
]);

const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 1000;
const clientNames = new Map<string, { name: string; expiresAt: number }>();

function header(headers: HeaderBag, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function callerKey(headers: HeaderBag): string | undefined {
  const auth = header(headers, "authorization");
  if (!auth) return undefined;
  return `${auth}|${header(headers, "user-agent") ?? ""}`;
}

/** Lowercase slug: "Claude Code" -> "claude-code" */
function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64);
}

/**
 * Maps a client name or User-Agent to a known source. Known tools get a stable id; with
 * `keepUnknown`, any other name is returned as a slug (for handshake names like "zed").
 */
export function normalizeClientName(raw: string | undefined | null, keepUnknown = true): string | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes("claude-code") || v.includes("claude code") || v.includes("claude_code")) return "claude-code";
  if (v.includes("cursor")) return "cursor";
  if (v.includes("codex")) return "codex";
  if (v.includes("gemini")) return "gemini";
  if (v.includes("grok") || v.includes("xai")) return "grok";
  if (v.includes("chatgpt") || v.includes("openai")) return "chatgpt";
  if (v.includes("windsurf") || v.includes("codeium")) return "windsurf";
  if (v.includes("visual studio code") || v.includes("vscode") || v.includes("copilot")) return "vscode";
  if (v.includes("claude") || v.includes("anthropic")) return "claude";
  if (v.includes("n8n")) return "n8n";
  if (v.includes("zapier")) return "zapier";
  if (v.includes("integromat") || v.includes("make.com") || /^make\b/.test(v)) return "make";
  if (!keepUnknown) return undefined;
  const name = slug(raw.split("/")[0] ?? "");
  return name && !GENERIC_AGENTS.has(name) ? name : undefined;
}

/**
 * Remembers `clientInfo.name` when `req` is an MCP `initialize` call. Never throws and never
 * consumes the original body.
 */
export async function rememberClientInfo(req: Request): Promise<void> {
  try {
    if (req.method !== "POST") return;
    if (!(req.headers.get("content-type") ?? "").includes("application/json")) return;
    const key = callerKey(req.headers);
    if (!key) return;
    const body = await req.clone().json();
    const messages = Array.isArray(body) ? body : [body];
    const init = messages.find((m) => m && m.method === "initialize");
    const name = normalizeClientName(init?.params?.clientInfo?.name);
    if (!name) return;
    if (clientNames.size >= MAX_CLIENTS) {
      const oldest = clientNames.keys().next().value;
      if (oldest !== undefined) clientNames.delete(oldest);
    }
    clientNames.set(key, { name, expiresAt: Date.now() + CLIENT_TTL_MS });
  } catch {
    // Not JSON or not an initialize call: nothing to remember
  }
}

/**
 * `platform` and `source` for a create_request call. `hint` is the tool input's `platform`, which a
 * model may fill with its own name ("claude", "grok"): an accepted API platform stays the platform,
 * anything else only counts as a source hint so the public API doesn't reject it.
 */
export function resolveRequestSource(
  headers: HeaderBag,
  hint?: string,
): { platform: string; source: string } {
  const trimmedHint = hint?.trim().toLowerCase();
  const platform = trimmedHint && API_PLATFORMS.has(trimmedHint) ? trimmedHint : "api";

  const key = callerKey(headers);
  const remembered = key ? clientNames.get(key) : undefined;
  const fromHandshake = remembered && remembered.expiresAt > Date.now() ? remembered.name : undefined;
  const fromUserAgent = normalizeClientName(header(headers, "user-agent"), false);
  const fromHint = trimmedHint && trimmedHint !== "api" ? normalizeClientName(trimmedHint) : undefined;

  return { platform, source: fromHandshake ?? fromUserAgent ?? fromHint ?? "mcp" };
}
