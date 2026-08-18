import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: sessionError || 'Não autorizado' }, { status: sessionStatus || 401 });
    }

    const apartmentId = req.nextUrl.searchParams.get('apartment_id');
    const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());
    const utilityType = req.nextUrl.searchParams.get('utility_type') || 'water';

    if (!apartmentId) {
      return NextResponse.json({ error: 'apartment_id é obrigatório' }, { status: 400 });
    }

    // Buscar todos os relatórios do ano para o apartamento e utilitário específico
    const reports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        apartmentId,
        yearRef: year,
        utilityType: utilityType as any,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        monthRef: true,
        consumption: true,
        partial: true,
        totalUnit: true,
      },
      orderBy: { monthRef: 'asc' },
    });

    // Mapear para os 12 meses
    const monthlyData = MONTH_NAMES_SHORT.map((label, index) => {
      const monthStr = String(index + 1).padStart(2, '0');
      const report = reports.find(r => r.monthRef === monthStr);
      
      return {
        month: label,
        monthRef: monthStr,
        consumption: Number(report?.consumption ?? 0),
        partial: Number(report?.partial ?? 0),
        totalUnit: Number(report?.totalUnit ?? 0),
        commonArea: Math.max(0, Number(report?.totalUnit ?? 0) - Number(report?.partial ?? 0)),
      };
    });

    const totalAnual = monthlyData.reduce((sum, item) => sum + item.consumption, 0);

    return NextResponse.json({
      year,
      apartmentId,
      utilityType,
      months: monthlyData,
      totalAnual,
    });
  } catch (error: any) {
    console.error('[dashboard/annual-consumption]', error);
    return NextResponse.json({ error: 'Erro ao carregar consumo anual' }, { status: 500 });
  }
}
