import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  allowedDevOrigins: [
    "www.acquaxcontrol.com.br",
    "acquaxcontrol.com.br",
    "*.sandbox.novita.ai",
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.acquaxcontrol.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.acquaxcontrol.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
