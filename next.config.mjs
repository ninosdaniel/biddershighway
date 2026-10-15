const nextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./src/content/reference/**/*.json", "./config/supabase-ca.crt"],
  },
  env: {
    NEXT_PUBLIC_LISTING_IMAGE_BASE_URL:
      process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL ||
      "https://bidders-highway.fra1.cdn.digitaloceanspaces.com/",
  },
};

export default nextConfig;
