/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [
    '@midcine/ui', '@midcine/auth', '@midcine/api-client',
    '@midcine/event-bus', '@midcine/command-palette', '@midcine/shared-types',
  ],
};
export default nextConfig;
