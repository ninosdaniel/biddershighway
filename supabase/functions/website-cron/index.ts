import {
  admin,
  constantEqual,
  env,
  errorResponse,
  HttpError,
  rpc,
} from "../_shared/http.ts";
import { Job, perform } from "../_shared/jobs.ts";

export async function handle(request: Request) {
  try {
    if (request.method !== "POST")
      throw new HttpError(405, "method_not_allowed");
    if (
      !(await constantEqual(
        request.headers.get("x-cron-secret") || "",
        env("CRON_SECRET"),
      ))
    )
      throw new HttpError(401, "unauthorized");
    const db = admin();
    let completed = 0;
    let failed = 0;
    const started = Date.now();
    // One job at a time, so leases do not expire while sitting in a local batch.
    while (Date.now() - started < 25000) {
      const jobs = (await rpc(db, "website_claim_jobs", {
        p_limit: 1,
      })) as Job[];
      if (!jobs.length) break;
      const job = jobs[0];
      try {
        await perform(db, job);
        await rpc(db, "website_finish_job", {
          p_id: job.id,
          p_lease: job.lease_token,
        });
        completed++;
      } catch (error) {
        // Whitelist error identifiers; provider bodies and PII never enter logs.
        const message =
          error instanceof Error && /^[a-z_]+(?:_\d+)?$/.test(error.message)
            ? error.message
            : "job_failed";
        await rpc(db, "website_finish_job", {
          p_id: job.id,
          p_lease: job.lease_token,
          p_error: message,
        });
        failed++;
      }
    }
    return Response.json(
      { completed, failed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
if (import.meta.main) Deno.serve(handle);
