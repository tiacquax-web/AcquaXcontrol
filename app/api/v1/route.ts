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
            'users.reset': 'POST /api/v1/users/{id}/reset',
            meters: '/api/v1/meters',
            readings: '/api/v1/readings',
            complexes: '/api/v1/complexes',
            apartments: '/api/v1/apartments',
            reports: '/api/v1/reports',
        },
        authentication: 'Bearer Token (API Key)',
        rateLimit: '300 req/min (padrão)',
    });
}
