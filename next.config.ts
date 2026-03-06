import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  allowedDevOrigins: [
    "www.acquaxcontrol.com.br",
    "acquaxcontrol.com.br",
    "3001-ic9ibhg7qmv99d3pr7e8o-a402f90a.sandbox.novita.ai",
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
