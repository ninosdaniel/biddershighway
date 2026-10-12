import { env, fetchJson } from "./http.ts";

let tokenCache: { value: string; expires: number } | undefined;
let tokenRequest: Promise<string> | undefined;
async function accessToken(force = false): Promise<string> {
  if (!Deno.env.get("FORTNOX_CLIENT_ID")) return env("FORTNOX_ACCESS_TOKEN");
  if (!force && tokenCache && tokenCache.expires > Date.now())
    return tokenCache.value;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const result = await fetchJson("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Basic ${btoa(`${env("FORTNOX_CLIENT_ID")}:${env("FORTNOX_CLIENT_SECRET")}`)}`,
        TenantId: env("FORTNOX_TENANT_ID"),
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (
      typeof result.access_token !== "string" ||
      !Number.isFinite(Number(result.expires_in))
    )
      throw new Error("invalid_provider_token");
    tokenCache = {
      value: result.access_token,
      expires: Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000,
    };
    return tokenCache.value;
  })();
  try {
    return await tokenRequest;
  } finally {
    tokenRequest = undefined;
  }
}

export async function fortnoxResponse(path: string, init: RequestInit = {}) {
  const send = async (token: string) =>
    fetch(`https://api.fortnox.se/3/${path}`, {
      ...init,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  let response = await send(await accessToken());
  if (response.status === 401 && Deno.env.get("FORTNOX_CLIENT_ID"))
    response = await send(await accessToken(true));
  if (!response.ok) throw new Error(`fortnox_http_${response.status}`);
  return response;
}
export async function fortnox(path: string, init: RequestInit = {}) {
  return (await fortnoxResponse(path, init)).json();
}

export function validInvoice(
  invoice: Record<string, unknown> | undefined,
  cents: number,
) {
  return Boolean(
    invoice &&
    !invoice.Cancelled &&
    invoice.InvoiceType === "INVOICE" &&
    invoice.Booked &&
    invoice.Currency === "SEK" &&
    invoice.Total !== undefined &&
    Math.round(Number(invoice.Total) * 100) === cents &&
    invoice.Balance !== undefined &&
    Number.isFinite(Number(invoice.Balance)),
  );
}

export function invoicePaid(
  invoice: Record<string, unknown> | undefined,
  cents: number,
) {
  return (
    validInvoice(invoice, cents) &&
    Number(invoice!.Balance) === 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(invoice!.FinalPayDate || ""))
  );
}

export function invoiceOcr(number: string) {
  const digits = number.replace(/\D/g, "");
  if (!digits || digits.length > 28) throw new Error("invalid_invoice_number");
  const payload = `${digits}${(digits.length + 2) % 10}`;
  const sum = [...payload].reverse().reduce((total, digit, index) => {
    const value = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return total + Math.floor(value / 10) + (value % 10);
  }, 0);
  return `${payload}${(10 - (sum % 10)) % 10}`;
}
