/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [
    '@midcine/ui',
    '@midcine/auth',
    '@midcine/api-client',
    '@midcine/event-bus',
    '@midcine/command-palette',
    '@midcine/shared-types',
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Reader embeds OHIF iframe, so DENY would break it. Use ALLOWFROM viewer subdomain.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
