/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@midcine/ui',
    '@midcine/auth',
    '@midcine/api-client',
    '@midcine/command-palette',
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
