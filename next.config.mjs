/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Drop the default X-Powered-By header for a leaner production surface.
  poweredByHeader: false,
  images: {
    // App serves static image assets directly from /public/assets/images via
    // plain <img> tags, so Next's image optimizer is not required.
    unoptimized: true,
  },
  // NOTE: `output: 'standalone'` is intentionally omitted. It emits a
  // self-contained server for self-hosted/Docker deploys and conflicts with
  // Vercel's managed build output (Vercel expects a standard `.next`
  // directory). Re-add it only for non-Vercel container pipelines.
  // Surface build-time type/runtime errors loudly instead of swallowing them.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
