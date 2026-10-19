import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Client and server are type-checked separately (`bun run typecheck`), as in TaxTrail.
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: __dirname,
  },
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
