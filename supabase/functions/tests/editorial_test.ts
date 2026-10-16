import { handle } from "../website-api/index.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
Deno.test(
  "article comments bind the authenticated author and validate IDs without allowing arbitrary polymorphic targets",
  async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const post = "22222222-2222-4222-8222-222222222222";
    const request = "33333333-3333-4333-8333-333333333333";
    const vars = {
      SUPABASE_URL: "https://editorial.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      RATE_LIMIT_SECRET: "test-secret",
    };
    const previous = Object.fromEntries(
      Object.keys(vars).map((key) => [key, Deno.env.get(key)]),
    );
    const oldFetch = globalThis.fetch;
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert(
        url.origin === "https://editorial.test",
        "Unexpected provider call",
      );
      if (url.pathname === "/auth/v1/user")
        return Promise.resolve(
          Response.json({
            id: actor,
            email: "test@example.test",
            email_confirmed_at: "2026-01-01",
          }),
        );
      const name = url.pathname.split("/").at(-1)!;
      calls.push({ name, args: JSON.parse(String(init?.body)) });
      return Promise.resolve(
        Response.json(
          name === "website_rate_limit" ? true : { published: true },
        ),
      );
    };
    const call = (input: Record<string, unknown>, authenticated = true) =>
      handle(
        new Request("https://edge.test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authenticated ? { authorization: "Bearer test-token" } : {}),
          },
          body: JSON.stringify({
            action: "post_comment",
            input,
            request_id: request,
          }),
        }),
      );
    try {
      assert(
        (await call({ post_id: post, body: "Text" }, false)).status === 401,
      );
      assert(calls.length === 0);
      assert((await call({ post_id: "bad", body: "Text" })).status === 400);
      assert(
        (await call({ post_id: post, body: "Text", parent_id: "bad" }))
          .status === 400,
      );
      assert(!calls.some((call) => call.name === "website_post_comment"));
      assert(
        (
          await call({
            post_id: post,
            body: "Text",
            parent_id: post,
            user_id: post,
            p_auth_id: post,
            published_status: 2,
            commentable_type: "User",
          })
        ).status === 200,
      );
      assert(
        JSON.stringify(calls.at(-1)) ===
          JSON.stringify({
            name: "website_post_comment",
            args: {
              p_auth_id: actor,
              p_post_id: post,
              p_body: "Text",
              p_parent_id: post,
              p_request_id: request,
            },
          }),
      );
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(previous))
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  },
);
