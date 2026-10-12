import "./site.css";

export const metadata = {
  title: { default: "Bidders Highway", template: "%s | Bidders Highway" },
  description:
    "Buy and sell enthusiast and collector vehicles on Bidders Highway.",
  robots:
    process.env.SITE_INDEXABLE === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/brand/site.css" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
