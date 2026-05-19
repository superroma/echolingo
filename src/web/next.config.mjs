/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    // Dev only — in production the Azure Static Web Apps linked-Functions feature
    // proxies /api/* to the Function App natively. With output:'export', rewrites
    // are stripped from the static build but still active under `next dev`.
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:7071/api/:path*',
      },
    ];
  },
};

export default nextConfig;
