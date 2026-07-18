/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // dockerode and its transitive deps (ssh2, cpu-features) contain native
  // bindings that must not be bundled by webpack for server components.
  experimental: {
    serverComponentsExternalPackages: ['dockerode', 'ssh2', 'cpu-features'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('dockerode', 'ssh2', 'cpu-features');
    }
    return config;
  },
};

module.exports = nextConfig;
