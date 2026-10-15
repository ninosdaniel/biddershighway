import { createClient } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, "service_not_configured");
  return value;
}
export function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export type Database = ReturnType<typeof admin>;
export async function rpc(
  db: Database,
  name: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const safe =
      /^(authentication_required|account_disabled|terms_required|verification_required|address_required|auction_closed|seller_cannot_bid|invalid_bid_increment|bid_too_low|bid_matches_existing_maximum|idempotency_conflict|transactions_not_enabled|invalid_name|invalid_locale|invalid_email|invalid_phone|registration_required|not_found|offers_closed|offer_closed|forbidden|invalid_comment|invoice_not_ready|already_paid|payment_reconciliation_required|invalid_message|own_listing|invalid_search|search_limit|invalid_input|stale_record|ai_not_enabled|listing_incomplete)$/;
    throw new HttpError(
      error.message === "authentication_required" ? 401 : 422,
      safe.test(error.message) ? error.message : "request_failed",
    );
  }
  return data;
}
export function cors(request: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = env("ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim());
    if (!allowed.includes(origin))
      throw new HttpError(403, "origin_not_allowed");
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info, idempotency-key",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}
export async function jsonBody(
  request: Request,
  max = 32768,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "json_required");
  if (Number(request.headers.get("content-length")) > max)
    throw new HttpError(413, "request_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_json");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new HttpError(413, "request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
export function text(value: unknown, max = 1000): string {
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, "invalid_input");
  return value.trim();
}
export function uuid(value: unknown): string {
  const result = text(value, 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      result,
    )
  )
    throw new HttpError(400, "invalid_id");
  return result;
}
export function amount(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 2147483647
  )
    throw new HttpError(400, "invalid_amount");
  return Number(value);
}
export async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(result), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function constantEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
export async function authenticate(request: Request, db: Database) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer || bearer.startsWith("sb_"))
    throw new HttpError(401, "authentication_required");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(bearer);
  if (error || !user || !user.email_confirmed_at)
    throw new HttpError(401, "authentication_required");
  return user;
}
export async function rateLimit(
  request: Request,
  db: Database,
  bucket: string,
  limit: number,
  actor?: string,
) {
  // Forwarded IP is supplied by the Supabase gateway; never persist the address.
  const source =
    actor ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";
  const key = await digest(`${env("RATE_LIMIT_SECRET")}:${bucket}:${source}`);
  if (
    !(await rpc(db, "website_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window: 600,
    }))
  )
    throw new HttpError(429, "too_many_requests");
}
export function errorResponse(error: unknown, headers?: Headers): Response {
  const known = error instanceof HttpError;
  // Never return database details, tokens, provider payloads, or personal information.
  return Response.json(
    { error: known ? error.message : "service_unavailable" },
    { status: known ? error.status : 503, headers },
  );
}
export async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return response.json();
}
