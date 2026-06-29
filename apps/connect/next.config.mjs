/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@midcine/ui', '@midcine/auth', '@midcine/api-client', '@midcine/shared-types'],
};
