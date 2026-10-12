import { Database, HttpError, rpc } from "./http.ts";
import { fortnox, fortnoxResponse } from "./fortnox.ts";

export async function ensureCustomer(db: Database, userId: string) {
  const user = await rpc(db, "website_billing_customer", { p_user: userId });
  if (!user) throw new Error("billing_customer_missing");
  if (user.fortnox_customer_id)
    return { number: user.fortnox_customer_id, locale: user.locale };
  const address = { ...user.address };
  if (user.customer_type !== 0)
    for (const [key, value] of Object.entries(user.company_address || {}))
      if (value) address[key] = value;
  if (
    !["line1", "city", "country", "postal_code"].every(
      (key) => typeof address[key] === "string" && address[key].trim(),
    )
  )
    throw new Error("billing_address_required");
  if (user.customer_type === 2 && !user.vat_id)
    throw new Error("billing_vat_id_required");
  const operation = await rpc(db, "website_provider_operation", {
    p_key: `customer:${userId}`,
  });
  if (operation.status === "started")
    throw new Error("customer_reconciliation_required");
  let number = operation.result?.number;
  if (!number) {
    const response = await fortnox("customers", {
      method: "POST",
      body: JSON.stringify({
        Customer: {
          Active: true,
          Currency: "SEK",
          Name:
            user.customer_type === 0
              ? user.name
              : user.company_name || user.name,
          Address1: address.line1,
          Address2: address.line2 || "",
          City: address.city,
          ZipCode: address.postal_code,
          CountryCode: address.country,
          Phone1: address.phone || "",
          Email: user.email,
          EmailInvoice:
            user.customer_type === 0
              ? user.email
              : user.company_billing_email || user.email,
          DefaultDeliveryTypes: { Invoice: "EMAIL" },
          ShowPriceVATIncluded: true,
          Type: user.customer_type === 0 ? "PRIVATE" : "COMPANY",
          VATType: user.customer_type === 2 ? "EUVAT" : "SEVAT",
          ...(user.customer_type === 2 ? { VATNumber: user.vat_id } : {}),
          ...(user.customer_type === 1
            ? { OrganisationNumber: user.vat_id }
            : {}),
          Comments: `Bidders Highway ${userId}`,
        },
      }),
    });
    if (!response.Customer?.CustomerNumber)
      throw new Error("invalid_billing_customer");
    number = String(response.Customer.CustomerNumber);
    await rpc(db, "website_provider_operation", {
      p_key: `customer:${userId}`,
      p_result: { number },
    });
  }
  const linked = await rpc(db, "website_billing_customer", {
    p_user: userId,
    p_number: number,
  });
  return { number: linked.fortnox_customer_id, locale: user.locale };
}

export async function invoicePdf(
  db: Database,
  authId: string,
  paymentId: string,
) {
  const payment = await rpc(db, "website_own_invoice", {
    p_auth_id: authId,
    p_id: paymentId,
  });
  const response = await fortnoxResponse(
    `invoices/${encodeURIComponent(payment.number)}/preview`,
    { headers: { Accept: "application/pdf" } },
  );
  if (!response.headers.get("content-type")?.startsWith("application/pdf"))
    throw new HttpError(503, "invoice_not_ready");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length > 5000000 ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw new HttpError(503, "invoice_not_ready");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    filename: `Invoice-${payment.number.replace(/[^a-z\d-]/gi, "")}.pdf`,
    base64: btoa(binary),
  };
}
