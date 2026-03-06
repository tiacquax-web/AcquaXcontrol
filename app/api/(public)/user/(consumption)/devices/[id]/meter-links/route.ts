import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import prisma from '@/lib/prisma';
import { PermissionableEntity } from '@prisma/client';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const { id: deviceId } = await params;
    

    // Obter parâmetros de query
    const { searchParams } = new URL(req.url);
    const take = parseInt(searchParams.get('take') || '10');
    const skip = parseInt(searchParams.get('skip') || '0');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    console.log('Buscando MeterDeviceLinks para device:', { deviceId, take, skip, activeOnly });

    // Verificar permissões
    const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.meterDeviceLink, 'read');
    const hasSystemPermission = !!contexts.system;

    // Verificar se o device existe
    const device = await prisma.iotDevice.findFirst({
      where: {
        deviceId: deviceId,
        deletedAt: null
      }
    });

    if (!device) {
      return NextResponse.json({
        error: 'Dispositivo não encontrado'
      }, { status: 404 });
    }

    // Construir condições para a query
    const whereConditions: any = {
      deviceId: deviceId,
      // 🔥 FIX: Verificar tanto null quanto isSet: false para deletedAt
      OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } }
      ]
    };

    // Filtrar apenas links ativos se solicitado
    if (activeOnly) {
      const now = new Date();
      whereConditions.AND = [
        // Condição de deletedAt
        {
          OR: [
            { deletedAt: null },
            { deletedAt: { isSet: false } }
          ]
        },
        // Condições de data de atividade
        { startDate: { lte: now } },
        {
          OR: [
            { endDate: null },
            { endDate: { isSet: false } },
            { endDate: { gte: now } }
          ]
        }
      ];
      
      // Remover o OR original já que foi movido para AND
      delete whereConditions.OR;
    }

    // Buscar os links
    console.log('🔍 Buscando links com condições:', JSON.stringify(whereConditions, null, 2));
    const [links, totalCount] = await Promise.all([
      prisma.meterDeviceLink.findMany({
        where: whereConditions,
        include: {
          meter: {
            include: {
              apartment: {
                include: {
                  block: {
                    include: {
                      complex: {
                        select: {
                          id: true,
                          socialName: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          createdByUser: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { startDate: 'desc' },
          { createdAt: 'desc' }
        ],
        take,
        skip
      }),
      prisma.meterDeviceLink.count({
        where: whereConditions
      })
    ]);

    console.log('📊 Resultados da busca:', { 
      totalLinksFound: links.length, 
      totalCount,
      hasSystemPermission,
      userContexts: {
        apartmentIds: contexts.apartmentIds.length,
        blockIds: contexts.blockIds.length, 
        complexIds: contexts.complexIds.length,
        companyIds: contexts.companyIds.length
      }
    });

    // Filtrar por permissões se necessário
    let filteredLinks: typeof links;
    
    if (hasSystemPermission) {
      filteredLinks = links;
    } else {
      if (links.length > 0) {
        const linksWithPermission = links.filter(link => {
          // Verificar se o usuário tem permissão no medidor associado
          const meter = link.meter;
          if (!meter) return false;
          
          return (
            contexts.apartmentIds.includes(meter.apartmentId) ||
            contexts.blockIds.includes(meter.blockId || '') ||
            contexts.complexIds.includes(meter.complexId || '') ||
            contexts.companyIds.includes(meter.companyId || '')
          );
        });

        // Se existem links mas nenhum foi autorizado, retornar erro de autorização
        if (linksWithPermission.length === 0) {
          console.log('❌ Acesso negado: existem vínculos mas sem permissão');
          return NextResponse.json({
            error: 'Acesso negado',
            message: `Foram encontrados ${links.length} vínculo(s) para este dispositivo, mas você não tem permissão para visualizar nenhum deles.`,
            details: 'Verifique suas permissões de acesso aos medidores associados.'
          }, { status: 403 });
        }

        filteredLinks = linksWithPermission;
      } else {
        filteredLinks = [];
      }
    }

    return NextResponse.json({
      links: filteredLinks.map(link => ({
        id: link.id,
        meterId: link.meterId,
        deviceId: link.deviceId,
        startDate: link.startDate,
        endDate: link.endDate,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
        meter: {
          id: link.meter.id,
          register: link.meter.register,
          apartment: {
            id: link.meter.apartment.id,
            name: link.meter.apartment.name,
            block: {
              id: link.meter.apartment.block.id,
              name: link.meter.apartment.block.name,
              complex: {
                id: link.meter.apartment.block.complex.id,
                socialName: link.meter.apartment.block.complex.socialName
              }
            }
          }
        },
        createdByUser: link.createdByUser ? {
          id: link.createdByUser.id,
          name: link.createdByUser.name
        } : null
      })),
      totalCount: filteredLinks.length,
      pagination: {
        take,
        skip,
        hasMore: skip + take < totalCount
      }
    });

  } catch (error) {
    console.error('Erro ao buscar MeterDeviceLinks:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
