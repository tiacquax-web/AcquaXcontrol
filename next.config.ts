import type { NextConfig } from "next";

const PRODUCTION_DOMAIN = 'acqua-x-field.vercel.app';

// ─── Content Security Policy ─────────────────────────────────────────────────
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${PRODUCTION_DOMAIN}`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${PRODUCTION_DOMAIN} https://vitals.vercel-insights.com wss:`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── Permite origens externas no dev (sandbox / proxy) ────────────────────
  allowedDevOrigins: [
    '*.sandbox.novita.ai',
    'localhost',
    '127.0.0.1',
  ],

  // ─── Security & CORS headers ───────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'production'
              ? `https://${PRODUCTION_DOMAIN}`
              : '*',
          },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, Cookie, X-Requested-With' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          ...(process.env.NODE_ENV === 'production' ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          }] : []),
          ...(process.env.NODE_ENV === 'production' ? [{
            key: 'Content-Security-Policy',
            value: cspDirectives,
          }] : [{
            key: 'Content-Security-Policy-Report-Only',
            value: cspDirectives,
          }]),
        ],
      },
    ];
  },

  // ─── Image domains ────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: PRODUCTION_DOMAIN,
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
