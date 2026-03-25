import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { getUserContextsForActionOnEntity, getUserPermissions } from './userContexts';
import { createEntity, updateEntityData } from './userData';
import { User } from '@prisma/client';
import { NextRequest } from "next/server"

// Função para normalizar email removendo acentos e caracteres especiais
function normalizeEmail(email: string): string {
    // Mapa de caracteres acentuados para normais
    const accentMap: { [key: string]: string } = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n',
        'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
        'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
        'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
        'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
        'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
        'Ç': 'C', 'Ñ': 'N'
    };

    let normalized = email;

    // Substituir acentos
    for (const [accented, normal] of Object.entries(accentMap)) {
        normalized = normalized.replace(new RegExp(accented, 'g'), normal);
    }

    // Remover caracteres especiais não permitidos em emails (manter apenas letras, números, @, ., -, _)
    normalized = normalized.replace(/[^a-zA-Z0-9@.\-_]/g, '');

    // Converter para lowercase
    normalized = normalized.toLowerCase();

    return normalized;
}

export async function createUser({ name, email, password }: { name: string; email: string; password: string }, userId: string) {

  try {

    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'create');
    const hasUserCreatePermission = contexts.system ||
      contexts.companyIds.length > 0 ||
      contexts.complexIds.length > 0 ||
      contexts.blockIds.length > 0 ||
      contexts.apartmentIds.length > 0;

    if (!hasUserCreatePermission) {
      return { user: null, error: 'Não Autorizado', status: 401 };
    }
  
    validateNewPassword(password);

    // Normalizar email antes de salvar
    const normalizedEmail = normalizeEmail(email);

    const hashedPassword = await hash(password, 10);

    const {entity, error, status} = await createEntity(userId, 'user', { name, email: normalizedEmail, password: hashedPassword });

    return { user:entity, error: error, status: status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Não Autorizado' ? 401 : 500;
    return { user: null, error: message, status: statusCode };
  }
}

export async function updateUserPassword(id: string, password: string) {
  try {
    validateNewPassword(password);

    // Usar salt rounds alto (10) para senhas redefinidas pelos usuários
    const hashedPassword = await hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data: { 
        password: hashedPassword,
        // Limpar flag de redefinição obrigatória quando usuário redefine senha
        resetToken: null,
        resetTokenExpiry: null,
        mustUpdateCredentials: false
      },
    });

    return user;
  } catch (error) {
    throw new Error('Internal Server Error');
  }
}

export async function updateUser(id: string, data: User, userId:string) {
  try {
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const permissions = await getUserPermissions(userId);
    const canDeleteUsers = permissions.permissions.some((p) => p.entity === 'user' && p.action === 'delete');
    // TO-DO: O CERTO É COMPARAR O CONTEXTO (SE O USUÁRIO SENDO ATUALIZADO ESTÁ DENTRO DO CONTEXTO DO USUÁRIO QUE FAZ A REQUISIÇÃO)
    // if (!contexts.system) {
    //   throw new Error('Não autorizado');
    // }

    if (data.password) {
      validateNewPassword(data.password);
      data.password = await hash(data.password, 10);
    }

    // Síndico/Administradora: pode editar dados/senha, mas não pode promover privilégios sistêmicos.
    // Bloqueia alterações sensíveis de flags administrativas quando o perfil não possui delete de usuário.
    if (!canDeleteUsers) {
      delete (data as any).deletedAt;
      delete (data as any).createdByUserId;
      delete (data as any).updatedByUserId;
    }

    // Normalizar email se estiver sendo atualizado
    if (data.email) {
      data.email = normalizeEmail(data.email);
    }

    const {entity, error, status} = await updateEntityData(userId, 'user', id, data);
    
    console.log("######### User:", entity)

    return { user: entity, error, status };
  } catch (error) {
    return { user: null, error: error instanceof Error ? error.message : 'Erro interno', status: 500 };
  }
}

export async function updateCurrentUser(id: string, data: Partial<User>, userId: string, req: NextRequest) {
  try {
    // userId já foi validado pelo route handler — não revalidar aqui para evitar
    // falhas quando a sessão expirou do banco mas o JWT ainda é válido no cookie.
    // Apenas garantir que o usuário só pode atualizar a si mesmo.
    if (!userId || !id || userId !== id) {
      return { user: null, error: 'Usuário não autenticado', status: 401 };
    }

    // Whitelist allowed fields for self-update
    const allowedFields = ['name', 'email', 'photo', 'telephone', 'cell', 'genreId', 'documentPerson', 'preferences'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if ((data as any)[key] !== undefined) updateData[key] = (data as any)[key];
    }

    // If password provided, allow change when authenticated user equals target user
    if ((data as any).password) {
      validateNewPassword((data as any).password);
      updateData.password = await hash((data as any).password, 10);
      updateData.resetToken = null;
      updateData.resetTokenExpiry = null;
      updateData.mustUpdateCredentials = false;
    }

    // Normalize email when provided
    if (updateData.email) updateData.email = normalizeEmail(updateData.email);

    // Audit - use userId for updatedByUserId
    updateData.updatedByUserId = userId;

    // Direct update to avoid global 'user update' permission check
    const updatedUser = await prisma.user.update({ where: { id }, data: updateData });

    return { user: updatedUser, error: null, status: 200 };
  } catch (error: any) {
    // Tratar erro de email duplicado (Prisma P2002)
    if (error?.code === 'P2002' && error?.meta?.target?.includes('email')) {
      return { user: null, error: 'Este e-mail já está em uso por outra conta.', status: 409 };
    }
    return { user: null, error: error instanceof Error ? error.message : 'Erro interno', status: 500 };
  }
}

export function validateNewPassword(password: string) {
  if (password.length < 8) {
    throw new Error('A senha deve possuir pelo menos 8 caracteres.');
  }
}

export async function isUserSessionValid(userId: string, token: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      // check if the session is still valid
      sessions: {
        some: {
          token,
          expiresAt: {
            gt: new Date(),
          },
          deletedAt: null,
        }
      }
    },
  });

  if (!user) {
    return false;
  } else {
    return true;
  }
}

export async function isSessionValid(token: string) {
  const userSession = await prisma.session.findUnique({
    where: {
      token,
      expiresAt: {
        gt: new Date(),
      }
    },
  });

  if (!userSession) {
    return undefined;
  } else {
    return userSession;
  }
}

export async function getUserByValidSession(token: string) {
  const sessionUser = await prisma.session.findUnique({
    where: {
      token,
      expiresAt: {
        gt: new Date(),
      }
    },
    select: {
      user: true,
    },
  });

  return sessionUser?.user;
}

export async function validateUserSession(req: NextRequest):Promise<{ userId: string | null; error: string | null; status: number }> {
  // 1. Cookie de sessão (browser) — tenta primeiro no banco, depois verifica JWT diretamente
  const sessionCookie = req.cookies.get('session')?.value;
  if (sessionCookie) {
    const validSession = await isSessionValid(sessionCookie);
    if (validSession) {
      return { userId: validSession.userId, error: null, status: 200 };
    }
    // Sessão não está no banco (expirou ou foi limpa), mas o JWT pode ainda ser válido
    // Verifica o JWT diretamente do cookie
    try {
      const { jwtVerify } = await import('jose');
      const JWT_SECRET_VAL = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';
      const secret = new TextEncoder().encode(JWT_SECRET_VAL);
      const { payload } = await jwtVerify(sessionCookie, secret);
      const userId = payload.userId as string;
      if (userId) {
        return { userId, error: null, status: 200 };
      }
    } catch (_jwtErr) {
      // JWT inválido ou expirado — continua para outros métodos
    }
  }

  // 2. Bearer token JWT (chamadas Axios com Authorization: Bearer)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7);
    try {
      const { jwtVerify } = await import('jose');
      const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(jwtToken, secret);
      const userId = payload.userId as string;
      if (userId) {
        return { userId, error: null, status: 200 };
      }
    } catch (_e) {
      // Token inválido ou expirado
    }
  }

  return { userId: null, error: 'Unauthorized', status: 401 };
}

interface BulkUserData {
  name: string;
  email: string;
  password: string;
  apartmentId: string;
  blockName: string;
  apartmentName: string;
  deletedAt?: Date | null;
}

interface BulkUsersResult {
  success: {
    id: string;
    name: string;
    email: string;
    password: string;
    blockName: string;
    apartmentName: string;
  }[];
  errors: {
    email: string;
    error: string;
  }[];
  summary: {
    total: number;
    created: number;
    failed: number;
  };
}

export async function createBulkResidentsUsers(
  usersData: BulkUserData[],
  userId: string,
  roleId: string
): Promise<BulkUsersResult> {
  try {
    // Validar permissões
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'create');
    
    // Verificar se o usuário tem permissão para criar usuários em qualquer contexto
    const hasPermission = contexts.system || 
                         contexts.companyIds.length > 0 || 
                         contexts.complexIds.length > 0 || 
                         contexts.blockIds.length > 0 || 
                         contexts.apartmentIds.length > 0;

    if (!hasPermission) {
      throw new Error('Não Autorizado');
    }

    // Validar se o roleId existe
    const role = await prisma.role.findUnique({
      where: { id: roleId, deletedAt: null }
    });
    if (!role) {
      throw new Error('Role não encontrada');
    }

    console.log('Role validated:', role.name);

    const result: BulkUsersResult = {
      success: [],
      errors: [],
      summary: {
        total: usersData.length,
        created: 0,
        failed: 0
      }
    };

    // Verificar emails duplicados no banco
    const emails = usersData.map(u => u.email);
    console.time('------------- Fetching existing users');
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: emails }, deletedAt: null },
      select: { email: true }
    });
    console.timeEnd('------------- Fetching existing users');
    const existingEmails = new Set(existingUsers.map(u => u.email));

    // Verificar se todos os apartmentIds existem
    const apartmentIds = [...new Set(usersData.map(u => u.apartmentId))];
    console.time('------------- Fetching existing apartments');
    const existingApartments = await prisma.apartment.findMany({
      where: { id: { in: apartmentIds }, deletedAt: null },
      select: { id: true }
    });
    console.timeEnd('------------- Fetching existing apartments');
    const validApartmentIds = new Set(existingApartments.map(a => a.id));

    console.log('Apartment IDs to validate:', apartmentIds);
    console.log('Valid apartment IDs found:', Array.from(validApartmentIds));

    // Filtrar usuários válidos e preparar dados
    console.time('------------- Validating users data');
    const validUsers: (BulkUserData & { hashedPassword: string })[] = [];
    
    for (const userData of usersData) {
      console.time(`------------- Validating user: ${userData.email}`);
      if (existingEmails.has(userData.email)) {
        result.errors.push({
          email: userData.email,
          error: 'Email já existe'
        });
        result.summary.failed++;
        continue;
      }
      console.timeEnd(`------------- Validating user: ${userData.email}`);

      console.time(`------------- Validating apartment: ${userData.apartmentId}`);
      if (!validApartmentIds.has(userData.apartmentId)) {
        result.errors.push({
          email: userData.email,
          error: 'Apartamento não encontrado'
        });
        result.summary.failed++;
        continue;
      }
      console.timeEnd(`------------- Validating apartment: ${userData.apartmentId}`);

      console.time(`------------- Validating password: ${userData.email}`);
      try {
        console.time(`------------- Excetuting password validation: ${userData.email}`);
        validateNewPassword(userData.password);
        console.timeEnd(`------------- Excetuting password validation: ${userData.email}`);

        console.time(`------------- Hashing password: ${userData.email}`);
        // ESTRATÉGIA DE SEGURANÇA BALANCEADA:
        // - Salt rounds 4 (~4ms por hash) para criação em massa
        // - Tempo para quebrar: 1-2 dias (aceitável para senhas temporárias) segundo ClaudeAI
        // - Quando usuário atualiza para uma nova senha pelo app, serão 10 salt rounds (padrão de segurança)
        // - TODO: Usuários OBRIGATORIAMENTE devem redefinir senha no primeiro login
        // - TODO: Janela de exposição limitada a 30 dias
        const hashedPassword = await hash(userData.password, 4);
        console.timeEnd(`------------- Hashing password: ${userData.email}`);
        validUsers.push({
          ...userData,
          hashedPassword
        });
      } catch (error) {
        result.errors.push({
          email: userData.email,
          error: 'Senha inválida'
        });
        result.summary.failed++;
      }
      console.timeEnd(`------------- Validating password: ${userData.email}`);
    }

    console.timeEnd('------------- Validating users data');

    console.log('Valid users to create:', validUsers.length);

    if (validUsers.length === 0) {
      console.log('No valid users to create');
      return result;
    }

    // Criar usuários em lote
    console.time('------------- Preparing user data');
    const createUsersData = validUsers.map(user => ({
      name: user.name,
      email: normalizeEmail(user.email), // Normalizar email antes de salvar
      password: user.hashedPassword,
      mustUpdateCredentials: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByUserId: userId,
      updatedByUserId: userId,
      deletedAt: null,
      // TO-DO: Marcar para redefinição obrigatória de senha no primeiro login
      // resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
      // resetTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias para fazer login
    }));
    console.timeEnd('------------- Preparing user data');

    console.log('Creating users with data:', createUsersData.length);
    console.log('User data sample:', createUsersData[0]);

    // Validação: detectar e-mails duplicados dentro do próprio lote (após normalização)
    console.time('------------- Checking batch duplicate emails');
    const emailCounts = new Map<string, number>();
    for (const u of createUsersData) {
      const key = (u.email || '').toLowerCase().trim();
      emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
    }
    const duplicateEmails = Array.from(emailCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([email, count]) => ({ email, count }));
    console.timeEnd('------------- Checking batch duplicate emails');
    if (duplicateEmails.length > 0) {
      console.error('E-mails duplicados detectados no lote (pós-normalização):', duplicateEmails);
      const sample = duplicateEmails.slice(0, 10);
      const details = sample.map(d => `${d.email} (x${d.count})`).join(', ');
      throw new Error(`E-mails duplicados no lote. Resolva as colisões antes de tentar novamente. Total: ${duplicateEmails.length}. Amostra: ${details}`);
    }

    // Usar transaction para garantir consistência
    console.time('------------- Total transaction time');
    const transactionResult = await prisma.$transaction(async (prisma) => {
      // Criar usuários em lote
      console.time('------------- User createMany');
      const batchResult = await prisma.user.createMany({
        data: createUsersData
      });
      console.timeEnd('------------- User createMany');

      console.log('Batch create result:', batchResult);

      // Buscar os usuários criados para obter os IDs
      console.time('------------- Fetching created users');
      const createdUsers = await prisma.user.findMany({
        where: { 
          email: { in: validUsers.map(u => u.email) },
          deletedAt: null 
        },
        select: { id: true, name: true, email: true }
      });
      console.timeEnd('------------- Fetching created users');

      console.log('Created users found:', createdUsers.length);
      console.log('Valid users to create:', validUsers.length);

      // Verificar se todos os usuários foram encontrados
      if (createdUsers.length !== validUsers.length) {
        console.error('Mismatch between created and found users');
        throw new Error('Erro ao buscar usuários criados');
      }

      // Preparar role assignments
      console.time('------------- Preparing role assignments');
      const roleAssignments = createdUsers.map((user: { id: string; email: string }) => {
        const userData = validUsers.find(u => u.email === user.email);
        if (!userData) {
          throw new Error(`Dados do usuário não encontrados para email: ${user.email}`);
        }
        return {
          userId: user.id,
          roleId: roleId,
          contextId: userData.apartmentId,
          contextType: 'apartment' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdByUserId: userId,
          updatedByUserId: userId,
          deletedAt: null
        };
      });
      console.timeEnd('------------- Preparing role assignments');

      console.log('Role assignments to create:', roleAssignments.length);

      // Criar role assignments em lote (apenas se houver dados)
      if (roleAssignments.length > 0) {
        console.time('------------- RoleAssignment createMany');
        await prisma.roleAssignment.createMany({
          data: roleAssignments
        });
        console.timeEnd('------------- RoleAssignment createMany');
        console.log('Role assignments created successfully');
      }

      return { createdUsers, roleAssignments: roleAssignments.length };
    });
    console.timeEnd('------------- Total transaction time');

    const { createdUsers } = transactionResult;

    // Preparar resultado de sucesso
    result.success = createdUsers.map((user: { id: string; name: string; email: string }) => {
      const userData = validUsers.find(u => u.email === user.email);
      const originalUserData = usersData.find(u => u.email === user.email);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        password: originalUserData?.password || '',
        blockName: userData?.blockName || '',
        apartmentName: userData?.apartmentName || ''
      };
    });

    result.summary.created = createdUsers.length;

    return result;

  } catch (error: any) {
    console.error('Error in createBulkResidentsUsers:', error);
    // Preserve original error message so the API route can surface it in the response (toast)
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro interno do servidor');
  }
}

// Função para marcar usuários que precisam redefinir senha no primeiro login
export async function markUsersForPasswordReset(userIds: string[], userId: string) {
  try {
    // Por enquanto, usamos um campo existente ou criamos uma lógica alternativa
    // Futuramente, podemos adicionar um campo específico no schema
    
    // Estratégia temporária: usar o campo resetToken para indicar necessidade de redefinição
    const resetIndicator = 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN';
    
    await prisma.user.updateMany({
      where: { 
        id: { in: userIds },
        deletedAt: null 
      },
      data: { 
        resetToken: resetIndicator,
        resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
        updatedByUserId: userId
      }
    });

    console.log(`Marked ${userIds.length} users for mandatory password change on first login`);
    return true;
  } catch (error) {
    console.error('Error marking users for password reset:', error);
    return false;
  }
}

// Função para verificar se usuário precisa redefinir senha
export async function userNeedsPasswordReset(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { resetToken: true }
    });
    
    return user?.resetToken === 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN';
  } catch (error) {
    console.error('Error checking password reset requirement:', error);
    return false;
  }
}

// Função para limpar flag de redefinição de senha após usuário alterar
export async function clearPasswordResetFlag(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        resetToken: null,
        resetTokenExpiry: null
      }
    });
    return true;
  } catch (error) {
    console.error('Error clearing password reset flag:', error);
    return false;
  }
}
