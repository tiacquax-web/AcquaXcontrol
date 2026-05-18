/**
 * GET /api/v1
 * Informações gerais sobre a API pública.
 */
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        api: 'AcquaX Control API',
        version: 'v1',
        status: 'online',
        documentation: '/api-manager?tab=docs',
        endpoints: {
            users: '/api/v1/users',
            meters: '/api/v1/meters',
            readings: '/api/v1/readings',
            complexes: '/api/v1/complexes',
        },
        authentication: 'Bearer Token (API Key)',
        rateLimit: '300 req/min (padrão)',
    });
}
