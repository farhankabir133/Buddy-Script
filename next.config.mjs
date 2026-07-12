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
  // Emit a self-contained server bundle for small, fast Docker images if a
  // containerized pipeline is triggered. Vercel ignores this and uses its own
  // build output, so it is safe to keep for both targets.
  output: 'standalone',
  // Surface build-time type/runtime errors loudly instead of swallowing them.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
