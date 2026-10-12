"use client";

export default function ErrorPage({ reset }) {
  return (
    <main className="site-message" role="alert">
      <h1>We couldn’t load this page</h1>
      <p>Please try again in a moment.</p>
      <button className="site-button" onClick={reset}>
        Try again
      </button>
      <a href="/en">Return to Bidders Highway</a>
    </main>
  );
}
