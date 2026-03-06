import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.acquaxcontrol.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
