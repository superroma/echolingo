/** @type {import('next').NextConfig} */
const isProductionBuild = process.env.NODE_ENV === 'production';

const nextConfig = {
  // Only emit static export at build time. In `next dev` we want the full
  // server router so dynamic /[id] routes accept any id.
  ...(isProductionBuild ? { output: 'export' } : {}),
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  // No /api rewrite here on purpose: routing /api/* to the Functions host is the
  // Static Web Apps platform's job. In prod the SWA linked backend proxies it; in
  // dev the SWA CLI (`swa start`) does the same. Next only serves the frontend.
};

export default nextConfig;
