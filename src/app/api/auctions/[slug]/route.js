import { publicAuction } from "../../../../lib/site/database";
export async function GET(request, { params }) {
  const { slug } = await params;
  const locale = new URL(request.url).searchParams.get("locale") || "en";
  if (!["sv", "en", "de"].includes(locale) || slug.length > 240)
    return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const auction = await publicAuction(slug, locale);
    return Response.json(auction || { error: "not_found" }, {
      status: auction ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
