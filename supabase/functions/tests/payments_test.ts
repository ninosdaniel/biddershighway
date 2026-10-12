import {
  decimalCents,
  SwishOrder,
  validateSwishPayment,
  swishCallback,
} from "../_shared/swish.ts";
import { invoiceOcr, invoicePaid } from "../_shared/fortnox.ts";
import { Database, HttpError } from "../_shared/http.ts";
function assert(value: unknown): asserts value {
  if (!value) throw new Error("Assertion failed");
}

Deno.test(
  "Swish binds verified provider data to the stored invoice, merchant and exact amount",
  () => {
    const order = {
      id: "order",
      instruction_id: "A".repeat(32),
      payment_id: "11111111-1111-4111-8111-111111111111",
      invoice_number: "1380",
      amount_cents: 500000,
      currency: "SEK",
    } as SwishOrder;
    const result = {
      id: order.instruction_id,
      payeePaymentReference: "138065",
      payeeAlias: "1230000000",
      currency: "SEK",
      amount: "5000.00",
      status: "PAID",
      paymentReference: "B".repeat(32),
    };
    assert(validateSwishPayment(order, result, "1230000000").status === "PAID");
    for (const patch of [
      { amount: "4999.999" },
      { amount: "5000.01" },
      { currency: "EUR" },
      { payeeAlias: "1230000001" },
      { id: "C".repeat(32) },
      { payeePaymentReference: "OTHER" },
      { paymentReference: null },
      { status: "UNKNOWN" },
    ]) {
      let rejected = false;
      try {
        validateSwishPayment(order, { ...result, ...patch }, "1230000000");
      } catch {
        rejected = true;
      }
      assert(rejected);
    }
    assert(decimalCents("0.10") === 10);
    assert(Number.isNaN(decimalCents("5e3")));
  },
);

Deno.test(
  "Fortnox OCR matches original references; zero balance alone is not payment evidence",
  () => {
    for (const [number, expected] of [
      ["1380", "138065"],
      ["1381", "138164"],
      ["1383", "138362"],
    ])
      assert(invoiceOcr(number) === expected);
    const invoice = {
      Cancelled: false,
      InvoiceType: "INVOICE",
      Booked: true,
      Currency: "SEK",
      Total: 5000,
      Balance: 0,
      FinalPayDate: "2026-10-12",
    };
    assert(invoicePaid(invoice, 500000));
    assert(!invoicePaid({ ...invoice, FinalPayDate: null }, 500000));
    assert(!invoicePaid({ ...invoice, Cancelled: true }, 500000));
    assert(!invoicePaid({ ...invoice, InvoiceType: "CREDIT" }, 500000));
    assert(!invoicePaid(invoice, 500001));
  },
);

Deno.test("an unsigned Swish callback cannot make an order paid", async () => {
  const calls: string[] = [];
  const db = {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({
        data: { callback_identifier: "expected" },
        error: null,
      });
    },
  } as unknown as Database;
  let rejected = false;
  try {
    await swishCallback(
      new Request("https://example.test?provider=swish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "A".repeat(32), status: "PAID" }),
      }),
      db,
    );
  } catch (error) {
    rejected = error instanceof HttpError && error.status === 401;
  }
  assert(rejected);
  assert(calls.length === 1 && calls[0] === "website_swish_provider");
});
