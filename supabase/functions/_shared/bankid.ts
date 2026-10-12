import { Database, env, HttpError, rpc } from "./http.ts";
function client() {
  return Deno.createHttpClient({
    cert: env("BANKID_CLIENT_CERT_PEM"),
    key: env("BANKID_CLIENT_KEY_PEM"),
    caCerts: [env("BANKID_CA_PEM")],
  });
}
async function requestProvider(action: string, body: Record<string, unknown>) {
  const tls = client();
  try {
    const host =
      Deno.env.get("BANKID_ENV") === "production"
        ? "https://appapi2.bankid.com/rp/v6.0"
        : "https://appapi2.test.bankid.com/rp/v6.0";
    const response = await fetch(`${host}/${action}`, {
      client: tls,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new HttpError(503, "identity_provider_unavailable");
    return await response.json();
  } finally {
    tls.close();
  }
}
export async function bankid(
  db: Database,
  authId: string,
  action: string,
  orderId: string | undefined,
  ip: string,
) {
  if (action === "bankid_start") {
    if (!/^[a-f\d:.]+$/i.test(ip))
      throw new HttpError(400, "invalid_client_address");
    const response = await requestProvider("auth", { endUserIp: ip });
    const order = await rpc(db, "website_identity_order", {
      p_auth_id: authId,
      p_provider_id: response.orderRef,
      p_data: {
        qrStartToken: response.qrStartToken,
        qrStartSecret: response.qrStartSecret,
      },
    });
    return {
      id: order.id,
      status: "pending",
      autoStartToken: response.autoStartToken,
      ...(await qr(order)),
    };
  }
  const order = await rpc(db, "website_identity_order", {
    p_auth_id: authId,
    p_id: orderId,
  });
  if (action === "bankid_cancel") {
    await requestProvider("cancel", { orderRef: order.provider_id });
    return { status: "cancelled" };
  }
  const response = await requestProvider("collect", {
    orderRef: order.provider_id,
  });
  if (response.status === "complete") {
    if (!response.completionData?.user?.personalNumber)
      throw new HttpError(503, "identity_provider_unavailable");
    await rpc(db, "website_verify_identity", {
      p_auth_id: authId,
      p_provider: "bankid",
      p_reference: order.provider_id,
      p_event_id: order.provider_id,
    });
    return { status: "complete" };
  }
  if (response.status === "failed")
    return { status: "failed", hint: response.hintCode };
  return {
    id: order.id,
    status: "pending",
    hint: response.hintCode,
    ...(await qr(order)),
  };
}
async function qr(order: {
  created_at: string;
  data: { qrStartToken: string; qrStartSecret: string };
}) {
  const elapsed = String(
    Math.max(
      0,
      Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(order.data.qrStartSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hmac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(elapsed),
  );
  const hex = Array.from(new Uint8Array(hmac), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { qr_text: `bankid.${order.data.qrStartToken}.${elapsed}.${hex}` };
}
