# Fluxo de primeiro acesso: forcar atualizacao de email + senha (usuarios criados em massa)

## Objetivo
Quando um usuario for criado pela criacao em massa (modal de edicao de condominio), no primeiro acesso ele deve ser obrigado a atualizar email E senha. Nao ha confirmacao de email. O usuario deve ficar bloqueado do sistema ate concluir essa atualizacao.

## Principios do projeto (reuso e padrao)
- Nao reimplementar logicas que ja existem; apenas estender quando necessario.
- Manter padrao de arquitetura: services (axios) -> hooks -> componentes.
- Nunca fazer fetch direto em componente.

## Estado atual (referencias)
- Criacao em massa de usuarios: `app/api/(public)/user/users/route.ts` chama `createBulkResidentsUsers` em `lib/users.ts`.
- Validacao e hash de senha: `lib/users.ts` (validateNewPassword + bcrypt).
- Atualizacao do usuario autenticado (email + senha): `app/api/auth/me/route.ts` -> `updateCurrentUser` em `lib/users.ts`.
- Account page usa hook/service: `app/(main)/account/page.tsx` -> `hooks/useCurrentUser.ts` -> `services/myUserService.ts`.
- Login e sessao: `app/(auth)/login/page.tsx`, `app/api/auth/login/route.ts`, `middleware.ts`.
- `resetToken` e `resetTokenExpiry` sao usados para recovery por email (nao usar para primeiro acesso).

## Mudanca de modelo (recomendada)
Criar um campo dedicado no User para o primeiro acesso, evitando conflito com resetToken.
- Campo sugerido: `mustUpdateCredentials` (Boolean, default false).
- Uso exclusivo para fluxo de primeiro acesso (bulk).

## Comportamento esperado
1. Usuario criado em massa recebe credenciais temporarias.
2. No primeiro login, o sistema detecta `mustUpdateCredentials = true`.
3. Usuario e redirecionado para a tela de primeiro acesso e nao pode acessar outras rotas ate concluir.
4. Atualizacao deve:
   - validar email
   - validar senha (>= 8)
   - limpar `mustUpdateCredentials`
5. Sem confirmacao de email.

## Proposta de UX
### Tela "Primeiro acesso"
- Rota sugerida: `/first-access` (grupo `app/(auth)` ou `app/(main)`)
- Formulario:
  - Email (obrigatorio)
  - Nova senha (obrigatorio)
  - Confirmar nova senha (obrigatorio)
- Mensagem clara: "Voce precisa atualizar seus dados para continuar"
- Botao "Salvar e continuar"
- Sem opcao de pular

### Redirecionamento
- Apos login bem-sucedido:
  - Se `mustUpdateCredentials === true`: `router.push('/first-access')`
  - Caso contrario: `router.push('/dashboard')`
- Middleware/guard para bloquear acesso a rotas privadas enquanto `mustUpdateCredentials` for true.

## Rotas e componentes sugeridos
### Nova tela
- `app/(auth)/first-access/page.tsx`
  - Form de email + senha + confirmacao
  - Usa hook -> service -> endpoint (nada de fetch direto)

### Atualizacoes em telas existentes
- `app/(auth)/login/page.tsx`
  - Apos login, consultar `/api/auth/me` ou incluir `mustUpdateCredentials` na resposta do login
  - Redirecionar para `/first-access` quando necessario

### Middleware / protecao de rotas
- `middleware.ts` ou guard do layout principal
  - Se autenticado e `mustUpdateCredentials` true, redirecionar para `/first-access`
  - Permitir apenas `/first-access`, `/api/auth/*`, `/logout`

## API / Backend (reuso de logica existente)
### Marcar usuarios criados em massa
- Estender `createBulkResidentsUsers` para setar `mustUpdateCredentials = true` nos usuarios criados.
- Manter o restante do fluxo igual (validacao de senha, hash, etc).

### Expor flag
- Login (`app/api/auth/login/route.ts`): incluir `mustUpdateCredentials` na resposta.
- Me (`app/api/auth/me/route.ts`): incluir `mustUpdateCredentials` no objeto `user`.

### Finalizar primeiro acesso
- Reutilizar `PUT /api/auth/me` (updateCurrentUser) para atualizar email + senha.
- Estender `updateCurrentUser` para limpar `mustUpdateCredentials` quando senha for atualizada.

## Dados / Modelo
- Adicionar `mustUpdateCredentials` no `User` (Boolean, default false).
- Nao reutilizar `resetToken` (reservado para recovery).

## Regras de negocio
- Usuarios criados manualmente NAO entram no fluxo.
- Usuario com `mustUpdateCredentials` true NAO pode acessar area protegida.
- Novo email precisa ser unico; retornar erro claro se duplicado.

## Passos de implementacao (proposto)
1. Adicionar coluna `mustUpdateCredentials` no schema e migrar.
2. Setar `mustUpdateCredentials = true` na criacao em massa.
3. Expor flag no login e/ou `/api/auth/me`.
4. Criar tela `/first-access` com validacao de email/senha (usando hook/service).
5. Ajustar login para redirecionar se `mustUpdateCredentials`.
6. Adicionar middleware/guard para bloquear acesso enquanto a flag estiver ativa.
7. Testes manuais:
   - Usuario bulk: login -> redireciona -> salva -> acessa dashboard.
   - Usuario normal: login -> dashboard direto.

## Pontos em aberto
- Qual layout usar para `/first-access`: auth simples ou layout principal?
- O redirecionamento deve acontecer so no login ou tambem no refresh (guard)?

## Riscos / observacoes
- Precisamos definir como lidar com usuarios antigos criados em massa que ja existem no banco (backfill?).
- Inconsistencia de regra de senha no frontend (login valida 6, backend exige 8). Para primeiro acesso, seguir backend.

## Checklist de implementacao
- [x] Adicionar `mustUpdateCredentials` no `User` (default false) e aplicar migracao.
- [x] Setar `mustUpdateCredentials = true` na criacao em massa (`createBulkResidentsUsers`).
- [x] Expor `mustUpdateCredentials` no login e/ou `/api/auth/me`.
- [x] Limpar `mustUpdateCredentials` quando a senha for atualizada (`updateCurrentUser`).
- [x] Criar tela `/first-access` com email + senha + confirmacao (hook/service).
- [x] Ajustar login para redirecionar quando `mustUpdateCredentials` for true.
- [x] Atualizar middleware/guard para bloquear rotas privadas ate completar.
- [ ] Validar fluxo com testes manuais (bulk vs normal).
