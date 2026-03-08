import { serverError } from '@/lib/safeError';
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { DeviceManagementService } from '@/lib/services/device-management-service';
import { ReadingLinkService } from '@/lib/services/reading-link-service';
import prisma from '@/lib/prisma';
import { PermissionableEntity } from '@prisma/client';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { buildOrConditions } from '@/lib/utils';

export async function DELETE( req: NextRequest, { params }: { params: Promise<{ linkId: string }> } ): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const { linkId } = await params;

    console.log('Removendo link meter-device...', { linkId });

    // Remover o link
    const result = await DeviceManagementService.removeMeterDeviceLink(userId, linkId);

    if (!result.success) {
      return NextResponse.json({
        error: result.error || 'Erro ao remover link'
      }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Link removido com sucesso'
    });

  } catch (error) {
    console.error('Erro ao remover link meter-device:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

export async function PUT( req: NextRequest, { params }: { params: Promise<{ linkId: string }> } ): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const { linkId } = await params;
    const body = await req.json();

    // Validar dados obrigatórios
    if (!body.startDate) {
      return NextResponse.json({
        error: 'Data de início é obrigatória'
      }, { status: 400 });
    }

    console.log('Atualizando link meter-device...', { linkId, body });

    // Verificar permissões
    const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.meterDeviceLink, 'update');
    const hasSystemPermission = !!contexts.system;

    // Buscar o link existente
    const existingLink = await prisma.meterDeviceLink.findFirst({
      where: {
        id: linkId,
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ]
      },
      include: {
        meter: true
      }
    });

    if (!existingLink) {
      return NextResponse.json({
        error: 'Link não encontrado'
      }, { status: 404 });
    }

    // Verificar permissão no meter
    if (!hasSystemPermission) {
      const hasPermission = await prisma.meter.findFirst({
        where: {
          id: existingLink.meterId,
          deletedAt: null,
          OR: buildOrConditions(contexts, hasSystemPermission)
        }
      });
      
      if (!hasPermission) {
        return NextResponse.json({
          error: 'Sem permissão para atualizar este link'
        }, { status: 403 });
      }
    }

    const updateData = {
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      updatedByUserId: userId
    };

    // Verificar conflito de períodos (excluindo o link atual)
    const conflictingLink = await prisma.meterDeviceLink.findFirst({
      where: {
        id: { not: linkId },
        deviceId: existingLink.deviceId,
        AND: [
          {
            OR: [
              { deletedAt: null },
              { deletedAt: { isSet: false } }
            ]
          },
          { startDate: { lte: updateData.endDate || new Date('2099-12-31') } },
          {
            OR: [
              { endDate: null },
              { endDate: { gte: updateData.startDate } }
            ]
          }
        ]
      }
    });

    if (conflictingLink) {
      return NextResponse.json({
        error: 'O período especificado conflita com outro link existente'
      }, { status: 400 });
    }

    // Atualizar o link
    const updatedLink = await prisma.meterDeviceLink.update({
      where: { id: linkId },
      data: updateData,
      include: {
        meter: {
          include: {
            apartment: {
              include: {
                block: {
                  include: {
                    complex: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Atualizar leituras afetadas pela mudança de período
    // Primeiro, remover meterId das leituras do período antigo
    if (existingLink.startDate !== updateData.startDate || existingLink.endDate !== updateData.endDate) {
      await ReadingLinkService.updateReadingsForMeterDeviceLinks(userId, existingLink.deviceId, [
        {
          startDate: existingLink.startDate,
          endDate: existingLink.endDate,
          meterId: null // Remove o meterId do período antigo
        },
        {
          startDate: updateData.startDate,
          endDate: updateData.endDate,
          meterId: existingLink.meterId // Adiciona o meterId no novo período
        }
      ]);
    }

    return NextResponse.json({
      message: 'Link atualizado com sucesso',
      link: {
        id: updatedLink.id,
        meterId: updatedLink.meterId,
        deviceId: updatedLink.deviceId,
        startDate: updatedLink.startDate,
        endDate: updatedLink.endDate,
        meter: {
          id: updatedLink.meter.id,
          register: updatedLink.meter.register,
          apartment: {
            name: updatedLink.meter.apartment.name,
            block: {
              name: updatedLink.meter.apartment.block.name,
              complex: {
                socialName: updatedLink.meter.apartment.block.complex.socialName
              }
            }
          }
        }
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar link meter-device:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
