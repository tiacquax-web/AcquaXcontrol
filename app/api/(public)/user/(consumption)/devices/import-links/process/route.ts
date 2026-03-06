import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import prisma from '@/lib/prisma';
import { LinkImportService } from '@/lib/services/link-import-service';

interface ImportRow {
  DEVICE_ID: string;
  BLOCO: string;
  UNIDADE: string;
  CONDOMINIO: string;
  INICIO: string;
  FIM?: string;
  CHASSI?: string;
}

interface ProcessResult {
  success: boolean;
  createdLinks: number;
  createdLinkIds: string[];  // 🆕 IDs dos vínculos criados
  devicesForReprocessing: string[];
  metersForReprocessing: string[];
  errors: string[];
  details?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const body = await req.json();
    const rows: ImportRow[] = body.rows;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ 
        error: 'Dados inválidos ou planilha vazia' 
      }, { status: 400 });
    }

    console.log(`📁 (Refatorado) Processando ${rows.length} vínculos...`);

    const result = await LinkImportService.process(rows, userId);

    if (!result.success) {
      return NextResponse.json({
        error: 'Erro ao processar importação',
        details: result.errors.join('; ')
      }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Vínculos criados com sucesso',
      createdLinks: result.createdLinks,
      createdLinkIds: result.createdLinkIds,  // 🆕 Retorna IDs dos vínculos
      devicesForReprocessing: result.devicesForReprocessing,
      metersForReprocessing: result.metersForReprocessing,
      details: result.details
    });

  } catch (error) {
    console.error('Erro ao processar importação de vínculos:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

// 🚀 FUNÇÃO OTIMIZADA: Pré-buscar todos os devices necessários
async function getDevicesMap(deviceIds: string[]): Promise<Map<string, any>> {
  const uniqueDeviceIds = [...new Set(deviceIds.filter(Boolean))];
  
  const devices = await prisma.iotDevice.findMany({
    where: {
      deviceId: { in: uniqueDeviceIds },
      deletedAt: null
    },
    select: {
      id: true,
      deviceId: true,
      meterDeviceLinks: {
        where: { deletedAt: null },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          deletedAt: true
        }
      }
    }
  });

  return new Map(devices.map(device => [device.deviceId, device]));
}

// 🚀 FUNÇÃO OTIMIZADA: Pré-buscar todos os apartamentos necessários
async function getApartmentsMap(rows: ImportRow[]): Promise<Map<string, any>> {
  // Extrair contextos únicos
  const contexts = [...new Set(rows.map(row => 
    `${row.CONDOMINIO.toLowerCase()}|${row.BLOCO.toLowerCase()}|${row.UNIDADE.toLowerCase()}`
  ))];

  const condominios = [...new Set(rows.map(row => row.CONDOMINIO.toLowerCase()))];
  
  // Buscar todos os apartamentos de uma vez com joins otimizados
  const apartments = await prisma.apartment.findMany({
    where: {
      block: {
        complex: {
          socialName: { 
            in: condominios,
            mode: 'insensitive'
          },
          deletedAt: null
        },
        deletedAt: null
      },
      deletedAt: null
    },
    select: {
      id: true,
      name: true,
      block: {
        select: {
          id: true,
          name: true,
          complex: {
            select: {
              id: true,
              socialName: true
            }
          }
        }
      },
      meters: {
        where: { 
          deletedAt: null,
          status: 'Ativo'
        },
        select: {
          id: true,
          register: true
        }
      }
    }
  });

  // Criar mapa com chave composta
  const apartmentsMap = new Map();
  
  apartments.forEach(apartment => {
    const key = `${apartment.block.complex.socialName.toLowerCase()}|${apartment.block.name.toLowerCase()}|${apartment.name.toLowerCase()}`;
    apartmentsMap.set(key, apartment);
  });

  return apartmentsMap;
}

// (Implementação original substituída por LinkImportService.process)
