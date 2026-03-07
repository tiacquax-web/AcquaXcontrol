import type { NextConfig } from "next";

const PRODUCTION_DOMAIN = 'acquaxcontrol.com.br';
const ALLOWED_ORIGINS = [
  `https://${PRODUCTION_DOMAIN}`,
  `https://www.${PRODUCTION_DOMAIN}`,
];

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── Security & CORS headers ───────────────────────────────────────────────
  async headers() {
    return [
      {
        // API: CORS restrito ao domínio de produção
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            // Em produção, restringir ao domínio; em dev qualquer origem
            value: process.env.NODE_ENV === 'production'
              ? `https://${PRODUCTION_DOMAIN}`
              : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, Cookie, X-Requested-With',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400', // preflight cache 24h
          },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // DNS prefetch control
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // Todas as páginas: headers de segurança
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },

  // ─── Image domains ────────────────────────────────────────────────────────
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

  // ─── Redirects: www → non-www (SEO + consistência) ───────────────────────
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: `www.${PRODUCTION_DOMAIN}` }],
        destination: `https://${PRODUCTION_DOMAIN}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
