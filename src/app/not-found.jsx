import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-message">
      <img src="/brand/logo-footer.svg" alt="Bidders Highway" width="200" />
      <p className="eyebrow">404</p>
      <h1>That page could not be found</h1>
      <p>The link may have changed, or the page is no longer available.</p>
      <Link className="site-button" href="/en">
        Browse vehicles
      </Link>
    </main>
  );
}
