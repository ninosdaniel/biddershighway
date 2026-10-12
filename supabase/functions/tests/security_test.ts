import {
  amount,
  constantEqual,
  cors,
  HttpError,
  jsonBody,
  uuid,
} from "../_shared/http.ts";
import { verifyStripe, handle as webhook } from "../website-webhooks/index.ts";
import { handle as api } from "../website-api/index.ts";
import { handle as cron } from "../website-cron/index.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
Deno.test(
  "integer amounts, UUIDs and bounded JSON reject malformed requests",
  async () => {
    for (const value of [0, -1, 1.5, "100000", Number.MAX_SAFE_INTEGER]) {
      let caught = false;
      try {
        amount(value);
      } catch {
        caught = true;
      }
      assert(caught);
    }
    assert(amount(100000) === 100000);
    assert(uuid("11111111-1111-4111-8111-111111111111").length === 36);
    let caught = false;
    try {
      await jsonBody(
        new Request("https://example.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: "x".repeat(40000) }),
        }),
      );
    } catch (e) {
      caught = e instanceof HttpError && e.status === 413;
    }
    assert(caught);
  },
);
Deno.test(
  "CORS denies unapproved origins before any backend request",
  async () => {
    Deno.env.set("ALLOWED_ORIGINS", "https://bidders.example");
    const response = await api(
      new Request("https://example.test", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    assert(response.status === 403);
    assert(
      cors(
        new Request("https://example.test", {
          headers: { origin: "https://bidders.example" },
        }),
      ).get("Access-Control-Allow-Origin") === "https://bidders.example",
    );
  },
);
Deno.test("scheduler cannot be invoked without its own secret", async () => {
  Deno.env.set("CRON_SECRET", "test-scheduler-secret");
  assert(
    (await cron(new Request("https://example.test", { method: "POST" })))
      .status === 401,
  );
  assert(await constantEqual("same", "same"));
  assert(!(await constantEqual("a", "b")));
});
Deno.test(
  "Stripe signatures bind exact bytes and expire after five minutes",
  async () => {
    const now = 1700000000000,
      payload = '{"type":"identity.verification_session.verified"}',
      secret = "test-signing-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${now / 1000}.${payload}`),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const header = `t=${now / 1000},v1=${signature}`;
    assert(await verifyStripe(payload, header, secret, now));
    assert(!(await verifyStripe(payload + " ", header, secret, now)));
    assert(!(await verifyStripe(payload, header, secret, now + 301000)));
    Deno.env.set("STRIPE_WEBHOOK_SECRET", secret);
    assert(
      (
        await webhook(
          new Request("https://example.test", {
            method: "POST",
            body: payload,
          }),
        )
      ).status === 401,
    );
  },
);
