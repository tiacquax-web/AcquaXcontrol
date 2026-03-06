LGPD – Roteiro Técnico (próximos passos)

Objetivo: consolidar a conformidade mínima já alcançada e endereçar lacunas com baixo impacto no produto.

1) Sessões e retenção
- Adicionar índice TTL/rotina para limpeza de `Session` expiradas (ex.: job diário ou TTL no provider).
- Definir prazos de retenção para `User` e dados operacionais (consumo/leitura) e documentar internamente.

2) Exclusão/anonimização de conta (autoatendimento)
- Endpoint: `DELETE /api/auth/me` (requer confirmação de senha/2º fator).
- Estratégia: hard delete do `User` e/ou anonimização dos campos pessoais, mantendo dados operacionais agregados quando necessário por obrigação legítima/contratual.
- Revogar todas as `Session` do usuário após a operação.

3) Portabilidade
- Endpoint: `GET /api/auth/me/export` retornando pacote com dados pessoais do titular (perfil + leituras vinculadas que lhe dizem respeito).
- Formatos: JSON e opcionalmente XLSX (já existe base de export para admin).

4) Logging e observabilidade
- Política de logs: não registrar dados pessoais/sigilosos (senha, tokens, e‑mail completo, documento, etc.).
- Revisar rotas que registram payloads e substituir por IDs/contagens.

5) Segurança operacional
- Revisar `.env` e rotação periódica de credenciais (JWT secret, SMTP), mínimo privilégio.
- Habilitar `secure` para cookie em produção (já respeitado via `NODE_ENV`).

6) Documentação e processos
- Atualizar política pública ao implementar cada item (retenção, autoexclusão, portabilidade).
- Incluir contatos do DPO e SLA interno de resposta a solicitações (ex.: 15 dias úteis).

Notas de implementação
- O projeto usa soft delete (`deletedAt`) por padrão via extensão Prisma. Para exclusão definitiva, criar utilitário dedicado que remova/anonimize registros em cascata conforme o modelo.
- Para TTL de sessão em MongoDB, considerar índice em `expiresAt` ou job periódico para remover documentos expirados.

