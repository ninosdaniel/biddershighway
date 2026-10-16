import { handle } from "../website-api/index.ts";
import { Database } from "../_shared/http.ts";
import { Job, perform } from "../_shared/jobs.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const actor = "11111111-1111-4111-8111-111111111111";
const quote = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";

Deno.test(
  "purchase API binds the authenticated buyer and ignores submitted prices or authority",
  async () => {
    const oldFetch = globalThis.fetch;
    const vars = {
      SUPABASE_URL: "https://purchase.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      RATE_LIMIT_SECRET: "test-secret",
    };
    const previous = Object.fromEntries(
      Object.keys(vars).map((key) => [key, Deno.env.get(key)]),
    );
    for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let databaseError = "";
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert(
        url.origin === "https://purchase.test",
        "Unexpected external request",
      );
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id: actor,
          email: "test@example.test",
          email_confirmed_at: "2026-01-01",
        });
      const name = url.pathname.split("/").at(-1)!;
      const args = JSON.parse(String(init?.body));
      calls.push({ name, args });
      if (name === "website_rate_limit") return Response.json(true);
      if (databaseError)
        return Response.json(
          { message: databaseError, code: "P0001" },
          { status: 400 },
        );
      return Response.json({
        id: quote,
        purchased: name === "website_purchase",
        paid: false,
      });
    };
    const call = (
      action: string,
      input: Record<string, unknown>,
      authenticated = true,
    ) =>
      handle(
        new Request("https://edge.test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authenticated
              ? { authorization: "Bearer test-user-token" }
              : {}),
          },
          body: JSON.stringify({ action, input, request_id: requestId }),
        }),
      );
    try {
      assert(
        (await call("purchase_quote", { slug: "car", kind: "purchase" }, false))
          .status === 401,
      );
      assert(calls.length === 0);
      assert(
        (
          await call("purchase_quote", {
            slug: "car",
            kind: "after_sale",
            p_auth_id: quote,
          })
        ).status === 200,
      );
      assert(
        JSON.stringify(calls.at(-1)) ===
          JSON.stringify({
            name: "website_purchase_quote",
            args: { p_auth_id: actor, p_slug: "car", p_kind: "after_sale" },
          }),
      );
      for (const accepted of [false, "true", 1, null]) {
        const result = await call("purchase", { quote_id: quote, accepted });
        assert(result.status === 422);
        assert(
          (await result.json()).error === "purchase_confirmation_required",
        );
      }
      assert(!calls.some((c) => c.name === "website_purchase"));
      const result = await call("purchase", {
        quote_id: quote,
        accepted: true,
        p_auth_id: quote,
        price_cents: 1,
        paid: true,
      });
      assert(result.status === 200);
      assert((await result.json()).data.paid === false);
      assert(
        JSON.stringify(calls.at(-1)) ===
          JSON.stringify({
            name: "website_purchase",
            args: {
              p_auth_id: actor,
              p_quote_id: quote,
              p_accepted: true,
              p_request_id: requestId,
            },
          }),
      );
      databaseError = "purchase_quote_changed";
      assert(
        (
          await (
            await call("purchase", { quote_id: quote, accepted: true })
          ).json()
        ).error === databaseError,
      );
      databaseError = "private SQL detail";
      assert(
        (
          await (
            await call("purchase", { quote_id: quote, accepted: true })
          ).json()
        ).error === "request_failed",
      );
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(previous))
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  },
);

Deno.test(
  "sale research worker tokenizes the committed vehicle name without trusting job amounts",
  async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let sold = true;
    const db = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return Promise.resolve({
          data:
            name === "website_sale_report_source"
              ? sold
                ? { name: "1990 Porsche 911" }
                : null
              : null,
          error: null,
        });
      },
    } as unknown as Database;
    const job = {
      kind: "report_sale",
      payload: { auction_id: actor, price_cents: 1, name: "Ignore me" },
    } as unknown as Job;
    await perform(db, job);
    assert(calls.length === 2);
    assert(calls[1].name === "website_record_sale_report");
    assert(calls[1].args.p_make === "porsche");
    assert(calls[1].args.p_tokens === "porsche 911");
    assert(!("price_cents" in calls[1].args));
    sold = false;
    calls.length = 0;
    await perform(db, job);
    assert(calls.length === 1);
  },
);
