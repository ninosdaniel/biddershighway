import {
  constantEqual,
  Database,
  env,
  HttpError,
  jsonBody,
  rpc,
} from "./http.ts";
import { fortnox, invoiceOcr, invoicePaid, validInvoice } from "./fortnox.ts";

export type SwishOrder = {
  id: string;
  payment_id: string;
  instruction_id: string;
  callback_identifier: string;
  payer_alias: string | null;
  provider_token?: string;
  status: string;
  amount_cents: number;
  currency: string;
  invoice_number: string;
  payment_reference?: string;
};

function configuration() {
  const environment = env("SWISH_ENV");
  if (!["test", "production"].includes(environment))
    throw new HttpError(503, "service_not_configured");
  const payee = env("SWISH_PAYEE_ALIAS");
  if (!/^\d{10}$/.test(payee))
    throw new HttpError(503, "service_not_configured");
  const callback = `${env("SUPABASE_URL")}/functions/v1/website-webhooks?provider=swish`;
  if (new URL(callback).protocol !== "https:")
    throw new HttpError(503, "service_not_configured");
  return {
    payee,
    callback,
    host:
      environment === "production"
        ? "https://cpc.getswish.net"
        : "https://mss.cpc.getswish.net",
    cert: env("SWISH_CLIENT_CERT_PEM"),
    key: env("SWISH_CLIENT_KEY_PEM"),
    ca: env("SWISH_CA_PEM"),
  };
}

async function provider(path: string, method = "GET", body?: unknown) {
  const config = configuration();
  const client = Deno.createHttpClient({
    cert: config.cert,
    key: config.key,
    caCerts: [config.ca],
  });
  try {
    const response = await fetch(`${config.host}/swish-cpcapi/api/${path}`, {
      method,
      client,
      redirect: "error",
      headers: {
        "Content-Type":
          method === "PATCH"
            ? "application/json-patch+json"
            : "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new HttpError(503, "payment_provider_unavailable");
    return method === "PUT"
      ? { token: response.headers.get("PaymentRequestToken") }
      : method === "PATCH"
        ? null
        : await response.json();
  } finally {
    client.close();
  }
}

// Provider amounts are decimal strings. Never round an unexpected fractional
// amount into a successful payment, and never accept NaN/missing fields.
export function decimalCents(value: unknown): number {
  const match = String(value).match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
  if (!match) return NaN;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

export function validateSwishPayment(
  order: SwishOrder,
  result: Record<string, unknown>,
  payee: string,
) {
  if (
    result.id !== order.instruction_id ||
    result.payeePaymentReference !== invoiceOcr(order.invoice_number) ||
    result.payeeAlias !== payee ||
    result.currency !== "SEK" ||
    order.currency !== "SEK" ||
    decimalCents(result.amount) !== Number(order.amount_cents) ||
    !["CREATED", "PAID", "DECLINED", "ERROR", "CANCELLED"].includes(
      String(result.status),
    ) ||
    (result.status === "PAID" &&
      !/^[a-z\d]{1,64}$/i.test(String(result.paymentReference || "")))
  ) {
    throw new HttpError(409, "payment_reference_mismatch");
  }
  return {
    status: String(result.status),
    reference:
      result.status === "PAID" ? String(result.paymentReference) : null,
  };
}

export async function reconcileSwish(db: Database, order: SwishOrder) {
  if (["PAID", "DECLINED", "ERROR", "CANCELLED"].includes(order.status))
    return { id: order.id, status: order.status };
  const result = await provider(`v1/paymentrequests/${order.instruction_id}`);
  const verified = validateSwishPayment(order, result, configuration().payee);
  await rpc(db, "website_swish_result", {
    p_id: order.id,
    p_status: verified.status,
    p_reference: verified.reference,
  });
  return { id: order.id, status: verified.status };
}

export async function startSwish(
  db: Database,
  authId: string,
  paymentId: string,
  requestId: string,
  phone = "",
) {
  const config = configuration();
  const payer = phone.replace(/[ +()-]/g, "");
  if (payer && !/^\d{8,15}$/.test(payer))
    throw new HttpError(400, "invalid_phone");
  const order: SwishOrder = await rpc(db, "website_swish_order", {
    p_auth_id: authId,
    p_payment_id: paymentId,
    p_request_id: requestId,
    p_payer_alias: payer || null,
  });
  if (order.status === "new") {
    // Recheck accounting before requesting money; all amounts come from the
    // invoice owned by this user, never from the submitted form.
    const { Invoice: invoice } = await fortnox(
      `invoices/${encodeURIComponent(order.invoice_number)}`,
    );
    if (!validInvoice(invoice, Number(order.amount_cents)))
      throw new HttpError(409, "invoice_not_ready");
    if (invoicePaid(invoice, Number(order.amount_cents))) {
      await rpc(db, "website_record_payment", {
        p_id: paymentId,
        p_provider: "fortnox",
        p_provider_id: order.invoice_number,
        p_paid: true,
      });
      return { id: order.id, status: "PAID" };
    }
    if (decimalCents(invoice.Balance) !== Number(order.amount_cents))
      throw new HttpError(409, "payment_reconciliation_required");
    if (await rpc(db, "website_swish_claim", { p_id: order.id })) {
      // Persist the instruction before the external create. An uncertain create
      // is reconciled by GET; it never blindly creates another charge.
      const created = await provider(
        `v2/paymentrequests/${order.instruction_id}`,
        "PUT",
        {
          payeePaymentReference: invoiceOcr(order.invoice_number),
          callbackUrl: config.callback,
          callbackIdentifier: order.callback_identifier,
          ...(order.payer_alias ? { payerAlias: order.payer_alias } : {}),
          payeeAlias: config.payee,
          amount: (Number(order.amount_cents) / 100).toFixed(2),
          currency: "SEK",
          message: `${invoiceOcr(order.invoice_number)} ${order.invoice_number}`,
        },
      );
      if (created.token) {
        await rpc(db, "website_swish_token", {
          p_id: order.id,
          p_token: created.token,
        });
        order.provider_token = created.token;
      }
    }
  }
  const state = await reconcileSwish(db, order);
  return {
    ...state,
    ...(state.status === "CREATED" && order.provider_token
      ? { token: order.provider_token }
      : {}),
  };
}

export async function cancelSwish(db: Database, order: SwishOrder) {
  if (["PAID", "DECLINED", "ERROR", "CANCELLED"].includes(order.status))
    return { id: order.id, status: order.status };
  try {
    await provider(`v1/paymentrequests/${order.instruction_id}`, "PATCH", [
      { op: "replace", path: "/status", value: "cancelled" },
    ]);
  } catch {
    /* A payment may win the cancellation race; GET remains authoritative. */
  }
  return reconcileSwish(db, order);
}

export async function swishQr(order: SwishOrder) {
  if (!order.provider_token || order.status !== "CREATED")
    throw new HttpError(409, "payment_not_pending");
  const response = await fetch(
    "https://mpc.getswish.net/qrg-swish/api/v1/commerce",
    {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: order.provider_token,
        size: 300,
        format: "png",
        border: 0,
        transparent: false,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/png")
  )
    throw new HttpError(503, "payment_provider_unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 500000)
    throw new HttpError(503, "payment_provider_unavailable");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { image: `data:image/png;base64,${btoa(binary)}` };
}

export async function swishCallback(request: Request, db: Database) {
  const body = await jsonBody(request);
  if (typeof body.id !== "string" || !/^[A-F0-9]{32}$/.test(body.id))
    throw new HttpError(400, "invalid_reference");
  const order: SwishOrder = await rpc(db, "website_swish_provider", {
    p_instruction: body.id,
  });
  if (
    !order ||
    !(await constantEqual(
      request.headers.get("callbackIdentifier") || "",
      order.callback_identifier,
    ))
  )
    throw new HttpError(401, "invalid_signature");
  // No callback status, amount or payer field is trusted. The merchant's mTLS
  // connection supplies the current order and its financial reference.
  await reconcileSwish(db, order);
  return Response.json({ received: true });
}
