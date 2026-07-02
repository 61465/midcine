/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@midcine/ui',
    '@midcine/auth',
    '@midcine/api-client',
    '@midcine/command-palette',
  ],
  typedRoutes: false,
  webpack: (config, { isServer }) => {
    // 1) Enable WebAssembly (Cornerstone codecs + polyseg-wasm ship .wasm modules)
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    // 2) Node-only fallbacks for browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        os: false,
      };
    }

    // 3) Ignore optional codec deps that aren't in the browser path
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
  },
};

export default nextConfig;
