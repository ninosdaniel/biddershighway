const nextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./src/content/reference/**/*.json"],
  },
  // Support existing local configuration during the Vite-to-Next migration.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "",
    NEXT_PUBLIC_LISTING_IMAGE_BASE_URL:
      process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL ||
      process.env.VITE_LISTING_IMAGE_BASE_URL ||
      "https://bidders-highway.fra1.cdn.digitaloceanspaces.com/",
  },
};

export default nextConfig;
