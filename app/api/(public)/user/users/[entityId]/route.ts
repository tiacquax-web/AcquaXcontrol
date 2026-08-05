import { cleanEntityBody } from "@/lib/prisma"
import prisma from "@/lib/prisma"
import { createEntity, deleteEntity, updateEntityData } from "@/lib/userData"
import { updateUser, validateUserSession } from "@/lib/users"
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        console.log("######### User ID:", userId)

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody({...reqBody}); // Clean the body to remove unwanted fields
        console.log("######### Request Body:", reqBody)

        console.log("######### Body:", body)

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        console.log("######### Body:", body)
        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        console.log("######### Entity ID:", entityId)
        // Attempt to update the entity
        // const { entity: user, error: updateError, status: updateStatus } = await updateEntityData(userId, 'user', entityId, body);
        const { user, error: updateError, status: updateStatus } = await updateUser(reqBody.id, body, userId);
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!user) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });

        if ('password' in user) {
            user.password = undefined; // Remove password from the response
        }

        // Enviar email de boas-vindas se o email foi atualizado e é valido
        const updatedEmail = (user as any).email;
        const updatedName = (user as any).name;
        if (updatedEmail && !isBlockedEmailDomain(updatedEmail) && isEmailConfigured()) {
            try {
                const welcomeHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
                            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
                        </div>
                        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                            <h2 style="color: #333;">Ol&aacute; <strong>${updatedName || ''}</strong>!</h2>
                            <p style="color: #555; line-height: 1.6;">
                                Seu acesso ao AcquaX Control foi liberado com sucesso.
                            </p>
                            <p style="color: #555; line-height: 1.6;">
                                Atrav&eacute;s da plataforma, voc&ecirc; poder&aacute;:
                            </p>
                            <ul style="color: #555; line-height: 1.8; padding-left: 24px; margin: 8px 0 16px;">
                                <li>Acompanhar seu consumo de &aacute;gua;</li>
                                <li>Consultar suas filipetas mensais;</li>
                                <li>Monitorar seu consumo di&aacute;rio (em caso de medi&ccedil;&atilde;o por IOT) de forma pr&aacute;tica e transparente.</li>
                            </ul>
                            <div style="text-align: center; margin: 24px 0;">
                                <a href="https://www.acquaxcontrol.com.br" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
                            </div>
                            <p style="color: #555; line-height: 1.6;">
                                Seja bem-vindo(a)! Esperamos que o AcquaX Control facilite o acompanhamento do seu consumo e contribua para uma gest&atilde;o mais eficiente dos seus recursos.
                            </p>
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                            <p style="color: #999; font-size: 12px;">
                                Este e um email automatico do sistema AcquaXcontrol. Nao responda.<br/>
                                AcquaX do Brasil - Sistema de medicao e controle
                            </p>
                        </div>
                    </div>
                `;
                await sendEmail({
                    to: updatedEmail,
                    toName: updatedName || undefined,
                    subject: 'Bem-vindo(a) ao AcquaXcontrol!',
                    html: welcomeHtml,
                    text: 'Seu acesso ao AcquaX Control foi liberado com sucesso. Atraves da plataforma voce podera acompanhar seu consumo de agua, consultar filipetas mensais e monitorar seu consumo diario. Seja bem-vindo(a)! Acesse www.acquaxcontrol.com.br',
                });
                console.log('[User Update] Email de boas-vindas enviado para:', updatedEmail);
            } catch (emailErr: any) {
                console.error('[User Update] Falha ao enviar email de boas-vindas:', emailErr?.message);
                // Nao falha o update se o email falhar
            }
        }

        // Return the updated entity data
        return NextResponse.json(user, {status: updateStatus});

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error updating user:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        // 🔒 PROTEÇÃO 1: impede deleção do usuário admin@acquax.com
        const targetUser = await prisma.user.findUnique({ where: { id: entityId } });
        if (targetUser?.email === 'admin@acquax.com') {
            return NextResponse.json({ error: 'Este usuário é protegido e não pode ser excluído.' }, { status: 403 });
        }

        // 🔒 PROTEÇÃO 2: Programador não pode excluir usuários Administrador
        // Buscar roles do solicitante
        const requesterAssignments = await prisma.roleAssignment.findMany({
            where: {
                userId,
                contextType: 'system',
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { Role: { select: { name: true } } },
        });
        const requesterSystemRoles = requesterAssignments.map(a => a.Role?.name).filter(Boolean) as string[];
        const isRequesterAdministrador = requesterSystemRoles.includes('Administrador');
        const isRequesterProgramador = requesterSystemRoles.length > 0 && !isRequesterAdministrador;

        if (isRequesterProgramador) {
            // Buscar roles do usuário alvo
            const targetAssignments = await prisma.roleAssignment.findMany({
                where: {
                    userId: entityId,
                    contextType: 'system',
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { Role: { select: { name: true } } },
            });
            const targetSystemRoles = targetAssignments.map(a => a.Role?.name).filter(Boolean) as string[];
            const isTargetAdministrador = targetSystemRoles.includes('Administrador');

            if (isTargetAdministrador) {
                return NextResponse.json(
                    { error: 'Programadores não podem excluir contas de Administrador.' },
                    { status: 403 }
                );
            }
        }

        // Attempt to delete the entity
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'user', entityId);
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        // Return the deleted entity data
        return NextResponse.json(entity);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error deleting user:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}