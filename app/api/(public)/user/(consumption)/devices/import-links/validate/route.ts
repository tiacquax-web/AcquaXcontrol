import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import prisma from '@/lib/prisma';
import { LinkImportService } from '@/lib/services/link-import-service';

interface ValidationError {
  row: number;
  field: string;
  message: string;
  type: 'error' | 'warning';
}

interface ImportValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  processedRows: number;
  validRows: number;
}

interface ImportRow {
  DEVICE_ID: string;
  BLOCO: string;
  UNIDADE: string;
  CONDOMINIO: string;
  INICIO: string;
  FIM?: string;
  CHASSI?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const rows: ImportRow[] = body.rows;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ 
        error: 'Dados inválidos ou planilha vazia' 
      }, { status: 400 });
    }

  console.log(`🔍 Iniciando validação de ${rows.length} linhas (refatorado)...`);
  const result = await LinkImportService.validate(rows);
  return NextResponse.json(result);

  } catch (error) {
    console.error('Erro ao validar importação de vínculos:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

// (Implementação original movida para LinkImportService)
  const warnings: ValidationError[] = [];

