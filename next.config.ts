import type { NextConfig } from "next";

const PRODUCTION_DOMAIN = 'acquaxcontrol.com.br';

// ─── Content Security Policy ─────────────────────────────────────────────────
// Bloqueia scripts/recursos de origens não autorizadas (mitiga XSS persistente)
const cspDirectives = [
  "default-src 'self'",
  // Scripts: 'self' + inline necessário para Next.js hidratação + Vercel analytics
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
  // Estilos: 'self' + inline (Tailwind / CSS-in-JS)
  "style-src 'self' 'unsafe-inline'",
  // Imagens: próprio domínio + CDN + data URIs + blobs (previews de foto)
  `img-src 'self' data: blob: https://${PRODUCTION_DOMAIN} https://www.${PRODUCTION_DOMAIN} https://cdn.${PRODUCTION_DOMAIN}`,
  // Fontes
  `font-src 'self' data:`,
  // Conexões API e WebSockets
  `connect-src 'self' https://${PRODUCTION_DOMAIN} https://www.${PRODUCTION_DOMAIN} https://vitals.vercel-insights.com wss:`,
  // Frames: nenhum (previne clickjacking — reforça X-Frame-Options)
  "frame-ancestors 'none'",
  // Objetos embutidos (Flash, etc.): nenhum
  "object-src 'none'",
  // Base URI: apenas 'self' (previne ataques de base tag)
  "base-uri 'self'",
  // Formulários: apenas 'self'
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
        // API: CORS — aceita www e sem-www
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            // Aceita os dois domínios (com e sem www) + sandbox de dev
            value: process.env.NODE_ENV === 'production'
              ? `https://www.${PRODUCTION_DOMAIN}`
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
            value: '86400',
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // Todas as páginas: headers de segurança
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // HSTS só em produção — o Cloudflare já gerencia HTTPS no proxy
          ...(process.env.NODE_ENV === 'production' ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          }] : []),
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // ── Content Security Policy ─────────────────────────────────────
          // Aplicada apenas em produção para não quebrar hot-reload do dev
          ...(process.env.NODE_ENV === 'production' ? [{
            key: 'Content-Security-Policy',
            value: cspDirectives,
          }] : [{
            // Em desenvolvimento: modo report-only (não bloqueia, só loga no console)
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
      {
        protocol: 'https',
        hostname: 'acquaxcontrol.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // ─── ATENÇÃO: Nenhum redirect www ↔ sem-www aqui.
  // O Vercel já gerencia o redirect acquaxcontrol.com.br → www.acquaxcontrol.com.br
  // Qualquer redirect adicional aqui causaria ERR_TOO_MANY_REDIRECTS.
};

export default nextConfig;
