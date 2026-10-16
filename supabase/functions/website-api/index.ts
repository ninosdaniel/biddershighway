import {
  admin,
  amount,
  authenticate,
  cors,
  digest,
  env,
  errorResponse,
  fetchJson,
  HttpError,
  jsonBody,
  rateLimit,
  rpc,
  text,
  uuid,
} from "../_shared/http.ts";
import { bankid } from "../_shared/bankid.ts";
import { invoicePdf } from "../_shared/billing.ts";
import { vehicleUpload } from "../_shared/uploads.ts";
import { sanitizeGeneratedHtml } from "../_shared/ai.ts";
import {
  cancelSwish,
  reconcileSwish,
  startSwish,
  swishQr,
} from "../_shared/swish.ts";

export async function handle(request: Request): Promise<Response> {
  let headers: Headers | undefined;
  try {
    headers = cors(request);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      throw new HttpError(405, "method_not_allowed");
    const body = await jsonBody(request);
    const action = text(body.action, 40);
    const input = (
      body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? body.input
        : {}
    ) as Record<string, unknown>;
    const db = admin();
    let result;
    if (action === "lead") {
      await rateLimit(request, db, "lead", 5);
      if (input.accept_terms) throw new HttpError(422, "invalid_input"); // Original honeypot, not consent.
      if (Deno.env.get("REQUIRE_CAPTCHA") !== "false") {
        const proof = await fetchJson(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: new URLSearchParams({
              secret: env("TURNSTILE_SECRET_KEY"),
              response: text(input.captcha, 4096),
            }),
          },
        );
        if (
          !proof.success ||
          proof.hostname !== new URL(env("SITE_URL")).hostname
        )
          throw new HttpError(400, "captcha_required");
      }
      const id = uuid(body.request_id);
      // Stable across retries of this request, without persisting a plaintext capability.
      const capability = await digest(`${env("RATE_LIMIT_SECRET")}:lead:${id}`);
      result = await rpc(db, "website_submit_lead", {
        p_request_id: id,
        p_token_hash: await digest(capability),
        p_input: {
          kind: text(input.kind, 20),
          email: text(input.email, 254),
          phone: text(input.phone, 30),
          owner: text(input.owner || "", 100),
          registration_number: text(input.registration_number || "", 30),
          utm_source: text(input.utm_source || "", 200),
        },
      });
      result = { ...result, capability };
    } else if (action === "update_lead") {
      await rateLimit(request, db, "update_lead", 30);
      result = await rpc(db, "website_update_lead", {
        p_id: uuid(input.id),
        p_token_hash: await digest(text(input.capability, 128)),
        p_input: {
          comment: text(input.comment || "", 10000),
          location: text(input.location || "", 200),
          manufacturer: text(input.manufacturer || "", 100),
          model: text(input.model || "", 100),
          year: text(input.year || "", 4),
        },
      });
    } else {
      const user = await authenticate(request, db);
      await rateLimit(
        request,
        db,
        action,
        action === "bid"
          ? 60
          : action === "swish_status"
            ? 240
            : action === "swish_start"
              ? 10
              : 100,
        user.id,
      );
      if (action === "account")
        result = await rpc(db, "website_account", { p_auth_id: user.id });
      else if (action === "account_activity")
        result = await rpc(db, "website_account_activity", { p_auth_id: user.id });
      else if (action === "purchase_quote")
        result = await rpc(db, "website_purchase_quote", {
          p_auth_id: user.id, p_slug: text(input.slug, 300), p_kind: text(input.kind, 20),
        });
      else if (action === "purchase") {
        if (input.accepted !== true) throw new HttpError(422, "purchase_confirmation_required");
        result = await rpc(db, "website_purchase", {
          p_auth_id: user.id, p_quote_id: uuid(input.quote_id),
          p_accepted: true, p_request_id: uuid(body.request_id),
        });
      }
      else if (action === "staff_data")
        result = await rpc(db, "website_staff_data", { p_auth_id: user.id, p_resource: text(input.resource || "leads", 30), p_id: input.id ? uuid(input.id) : null, p_query: text(input.query || "", 200), p_page: Math.max(1, Math.min(10000, Number(input.page) || 1)) });
      else if (action === "ai_request")
        result = await rpc(db, "website_ai_request", { p_auth_id: user.id, p_kind: text(input.kind, 40), p_id: uuid(input.id), p_request_id: uuid(body.request_id) });
      else if (action === "ai_apply")
        result = await rpc(db, "website_ai_apply", { p_auth_id: user.id, p_id: uuid(input.id) });
      else if (["upload_prepare", "upload_complete"].includes(action))
        result = await vehicleUpload(db, user.id, action, input);
      else if (action === "classifieds")
        result = await rpc(db, "website_classifieds", { p_auth_id: user.id, p_slug: input.slug ? text(input.slug, 300) : null, p_staff: input.staff === true });
      else if (["classified_create", "classified_update", "classified_submit", "classified_publish", "classified_hide", "classified_sold", "classified_reopen"].includes(action)) {
        if (input.body_sv !== undefined) input.body_sv = sanitizeGeneratedHtml(text(input.body_sv, 20000));
        result = await rpc(db, "website_classified_command", { p_auth_id: user.id, p_action: action, p_input: input, p_request_id: uuid(body.request_id) });
      }
      else if (action === "conversations")
        result = await rpc(db, "website_conversations", {
          p_auth_id: user.id,
          p_id: input.id ? uuid(input.id) : null,
          p_before: input.before ? text(input.before, 40) : null,
        });
      else if (["conversation_start", "conversation_reply", "saved_search_create", "saved_search_delete", "preferences", "notification_delete", "notifications_read"].includes(action))
        result = await rpc(db, "website_customer_command", {
          p_auth_id: user.id, p_action: action, p_input: input,
          p_request_id: uuid(body.request_id),
        });
      else if (action === "invoice_pdf")
        result = await invoicePdf(db, user.id, uuid(input.payment_id));
      else if (action === "swish_start")
        result = await startSwish(
          db,
          user.id,
          uuid(input.payment_id),
          uuid(body.request_id),
          text(input.phone || "", 30),
        );
      else if (["swish_status", "swish_cancel", "swish_qr"].includes(action)) {
        const order = await rpc(db, "website_swish_order", {
          p_auth_id: user.id,
          p_payment_id: uuid(input.payment_id),
          p_order_id: uuid(input.id),
        });
        result =
          action === "swish_cancel"
            ? await cancelSwish(db, order)
            : action === "swish_qr"
              ? await swishQr(order)
              : await reconcileSwish(db, order);
      } else if (action === "contact")
        result = await rpc(db, "website_contact", {
          p_auth_id: user.id,
          p_slug: text(input.slug, 300),
        });
      else if (
        ["bankid_start", "bankid_poll", "bankid_cancel"].includes(action)
      ) {
        await rpc(db, "website_account", { p_auth_id: user.id });
        result = await bankid(
          db,
          user.id,
          action,
          action === "bankid_start" ? undefined : uuid(input.id),
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "",
        );
      } else if (action === "verify_identity") {
        await rpc(db, "website_account", { p_auth_id: user.id }); // Validate active, confirmed account.
        const site = new URL(env("SITE_URL"));
        const locale = ["en", "sv", "de"].includes(String(input.locale))
          ? input.locale
          : "en";
        const form = new URLSearchParams({
          type: "document",
          "metadata[auth_id]": user.id,
          return_url: `${site.origin}/${locale}/account/verification`,
          "options[document][require_matching_selfie]": "true",
        });
        const session = await fetchJson(
          "https://api.stripe.com/v1/identity/verification_sessions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
              "Idempotency-Key": `${user.id}:${uuid(body.request_id)}`,
            },
            body: form,
          },
        );
        result = { url: session.url };
      } else if (action === "offer_decision")
        result = await rpc(db, "website_offer_decision", {
          p_auth_id: user.id,
          p_offer_id: uuid(input.id),
          p_accept: input.accept === true,
        });
      else if (action === "post_comment")
        result = await rpc(db, "website_post_comment", {
          p_auth_id: user.id,
          p_post_id: uuid(input.post_id),
          p_body: text(input.body, 5000),
          p_parent_id: input.parent_id ? uuid(input.parent_id) : null,
          p_request_id: uuid(body.request_id),
        });
      else if (action === "comment")
        result = await rpc(db, "website_comment", {
          p_auth_id: user.id,
          p_slug: text(input.slug, 300),
          p_body: text(input.body, 5000),
          p_request_id: uuid(body.request_id),
        });
      else if (
        [
          "bid",
          "profile",
          "accept_terms",
          "bookmark",
          "notification_read",
          "offer",
        ].includes(action)
      ) {
        if (["bid", "offer"].includes(action)) {
          input.amount_cents = amount(input.amount_cents);
          input.slug = text(input.slug, 300);
          if (
            input.auto_bid !== undefined &&
            typeof input.auto_bid !== "boolean"
          )
            throw new HttpError(400, "invalid_input");
        }
        result = await rpc(db, "website_command", {
          p_auth_id: user.id,
          p_action: action,
          p_input: input,
          p_request_id: uuid(body.request_id),
        });
      } else throw new HttpError(404, "unknown_action");
    }
    return Response.json({ data: result }, { headers });
  } catch (error) {
    return errorResponse(error, headers);
  }
}
if (import.meta.main) Deno.serve(handle);
