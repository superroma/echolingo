/** @type {import('next').NextConfig} */
const isProductionBuild = process.env.NODE_ENV === 'production';

const nextConfig = {
  // Only emit static export at build time. In `next dev` we want the full
  // server router so dynamic /lesson/[id] routes accept any id.
  ...(isProductionBuild ? { output: 'export' } : {}),
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    // Dev only — in production Azure Static Web Apps' linked-Functions feature
    // proxies /api/* to the Function App natively.
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:7071/api/:path*',
      },
    ];
  },
};

export default nextConfig;
