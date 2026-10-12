import {
  admin,
  constantEqual,
  env,
  errorResponse,
  fetchJson,
  HttpError,
  rpc,
} from "../_shared/http.ts";
import { swishCallback } from "../_shared/swish.ts";

export async function verifyStripe(
  payload: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const entries = signature.split(",").map((s) => s.split("="));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  for (const [version, value] of entries)
    if (version === "v1" && (await constantEqual(value, expected))) return true;
  return false;
}
export async function handle(request: Request) {
  try {
    if (request.method !== "POST")
      throw new HttpError(405, "method_not_allowed");
    if (new URL(request.url).searchParams.get("provider") === "swish")
      return await swishCallback(request, admin());
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "invalid_body");
    let payload = "";
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new HttpError(413, "request_too_large");
      }
      payload += decoder.decode(value, { stream: true });
    }
    payload += decoder.decode();
    if (
      !(await verifyStripe(
        payload,
        request.headers.get("stripe-signature") || "",
        env("STRIPE_WEBHOOK_SECRET"),
      ))
    )
      throw new HttpError(401, "invalid_signature");
    const event = JSON.parse(payload);
    if (event.type === "identity.verification_session.verified") {
      const reference = event.data.object.id;
      if (!/^vs_[A-Za-z0-9]+$/.test(reference))
        throw new HttpError(400, "invalid_reference");
      // Verify current provider state, never trust a browser return or metadata alone.
      const verified = await fetchJson(
        `https://api.stripe.com/v1/identity/verification_sessions/${reference}`,
        { headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` } },
      );
      if (verified.status !== "verified")
        throw new HttpError(409, "verification_pending");
      await rpc(admin(), "website_verify_identity", {
        p_auth_id: verified.metadata.auth_id,
        p_provider: "stripe_identity",
        p_reference: reference,
        p_event_id: event.id,
      });
    }
    return Response.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
if (import.meta.main) Deno.serve(handle);
