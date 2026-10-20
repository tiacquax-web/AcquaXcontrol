# Relatório de Otimização — MongoDB 2GB / AcquaXcontrol (20/10/2026)

## Contexto
Instância MongoDB gerenciada DO (2GB RAM, cache WiredTiger ~471MB) sofrendo OOM.
Causa raiz: queries com filtros relacionais Prisma forçando COLLSCAN sobre coleções
grandes + índices demais em `Readings` (10,96M docs, 4,1GB de índices).

## Correções aplicadas (equivalência comprovada em produção, somente leitura)

| # | Onde | Antes | Depois | Ganho medido |
|---|------|-------|--------|--------------|
| 1 | `lib/userData.ts` (apartment/block) | filtro relacional `block: {complexId}` no OR → COLLSCAN de ~36k docs | pré-resolução escalar `blockId IN (...)` via índice | listagem Botânica: 4533ms → 240ms; 0 divergências em 11 condomínios amostrados + identidade relacional exata |
| 2 | `lib/userContexts.ts` (Permissions) | filtro triplo permission→role→RoleAssignment com $lookup por permissão | pré-resolve roleIds do usuário + `roleId IN (...)` escalar | elimina varredura completa de 440 Permissions por chamada; 0 divergências em 5 usuários |
| 3 | `app/api/admin-stats/route.ts` | RA distinct de 21k + ACR distinct global 362k docs (~37s) | sondas `findFirst` indexadas em lotes de 50 + helper compartilhado | distinct 9,1s → sondas ~3,5s (sandbox; bem menos saindo da Vercel) |
| 4 | `app/api/apuracao/route.ts` | ACR distinct+orderBy global (~37s) | helper `latestReportByComplex` | idem |
| 5 | `app/api/cron/send-monthly-summary/route.ts` | carregava TODOS os ACRs do mês global com includes (lote pesadíssimo) | lista complexIds (distinct) e processa por condomínio via índice {complexId, yearRef, monthRef, deletedAt} | mês 09/2026: agrupamento idêntico (0 divergências em 10.613 docs) |
| 6 | `prisma/schema.prisma` + `Readings` | 34 índices, 4,1GB | removidos 7 índices REDUNDANTES POR PREFIXO (nenhum unique; todo query que usava o curto usa o prefixo do longo) | **490 MB liberados** (4116→3627 MB). Rollback: `scripts/db-audit/backups/readings-rollback-indexes.txt` |
| 7 | `app/api/cron/cleanup-soft-deleted/route.ts` | nunca funcionou: POST-only + Bearer (Vercel Cron chama GET), deleteMany interceptado como soft-delete (re-carimbava deletedAt), relações com nome errado (`readings`, `roleAssignments`) quebravam em runtime | GET+POST com auth dos demais crons; modo **inventário não-destrutivo** (conta candidatos ao purge); nomes corretos | cron deixa de dar 405/500 mensal; purge real fica pendente de decisão (ver abaixo) |
| 8 | Typecheck | 35 erros pré-existentes | **0 erros** (client Prisma regenerado; guards de null p/ medidores órfãos em meter-links e device-management; casts pontuais sem mudança de runtime) | build limpo |

## Backups de segurança (não versionados)
- `scripts/db-audit/backups/2026-10-20/`: Permissions (440), RoleAssignment (21.578), Roles (7) em JSON.
- Rollback dos índices: `scripts/db-audit/backups/readings-rollback-indexes.txt`.
- Instância é gerenciada (DO) com snapshots automáticos.

## Análise de permissões órfãs (inertes — NÃO deletadas, exige autorização)
- Permissions com roleId inexistente: **125 de 440**
- RoleAssignment com roleId inexistente: **207 de 21.578**
- RoleAssignment com userId inexistente: **114 de 21.578**
Não causam erro (simplesmente nunca casam). Limpeza proposta: arquivar (soft-delete) ou
deletar após confirmação — aguardando decisão.

## Pendências / propostas (não executadas por segurança)
1. **Purge real do cron cleanup** (~candidatos: ver resposta do cron) — precisa de
   decisão sobre integridade referencial antes de ativar (`ENABLE_HARD_PURGE`).
2. Índices de Readings com uso zero no código mas não provavelmente redundantes:
   `{iotDeviceId}` (46MB, 0 usos no código), `{isManualReading}` (46MB),
   `{isPreReading}` (46MB), `{yearRef, monthRef}` (49MB), pares quase-duplicados
   (`{X,deletedAt}` vs `{X,readAt,deletedAt}` ~212MB, e o trio `deviceId/readAt/deletedAt`
   em 3 permutações ~370MB). Recomendo reavaliar com $indexStats após 7+ dias de
   uptime (janela atual: 2h desde o restart do OOM).
3. Upgrade da instância DO (2GB → 4GB) se OOM persistir; as correções acima já
   reduzem muito a pressão de cache (490MB de índices a menos + queries indexadas).

## Como reverter
- Código: `git revert` do commit desta mudança.
- Índices: rodar o arquivo de rollback (createIndex com nomes originais).
- Nenhum dado foi apagado ou alterado; todas as mudanças de banco foram só dropIndex
  de índices redundantes (metodologicamente seguros).
