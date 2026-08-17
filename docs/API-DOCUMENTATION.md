# Documentação da API — AcquaXcontrol

> Gerado em 07/07/2026 com base no código-fonte real do projeto.

O AcquaXcontrol tem **duas APIs distintas**:

1. **API Interna** (`/api/...`) — usada pelo próprio frontend (React/Next.js). Autenticação por **cookie de sessão** (login via `/api/auth/login`). É a mais completa: cobre usuários, condomínios, medidores, leituras, importações, etc.
2. **API Pública v1** (`/api/v1/...`) — feita para integrações externas (parceiros, sistemas terceiros). Autenticação por **API Key** (Bearer Token), somente leitura (`GET`), com permissões e rate limit configuráveis. Gerenciada em `/api-manager` dentro do sistema.

---

## 1. API Pública v1 (API Key) — para integrações externas

### Autenticação
```
Authorization: Bearer ak_<keyId>_<secret>
```
A chave é gerada na tela **Gerenciador de API** (`/api-manager`), onde também dá pra definir permissões (`users:read`, `meters:read`, etc.), escopo (por condomínio/empresa), IPs liberados e rate limit.

Erros:
- `401` — token ausente/inválido/expirado
- `403` — IP bloqueado ou permissão insuficiente
- `429` — rate limit excedido

### Base URL
```
https://<seu-dominio>/api/v1
```

### Endpoints disponíveis hoje (todos GET)

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/api/v1/users` | `users:read` | Lista usuários (paginado) |
| GET | `/api/v1/meters` | `meters:read` | Lista medidores |
| GET | `/api/v1/readings` | `readings:read` | Lista leituras |
| GET | `/api/v1/complexes` | `complexes:read` | Lista condomínios |

**Parâmetros comuns:** `take` (máx. 100, padrão 20), `skip` (paginação), `search`, `complex_id`, `block_id`, `meter_id`, `from` / `to` (datas ISO).

Exemplo:
```bash
curl "https://app.acquaxcontrol.com/api/v1/readings?meter_id=abc123&from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer ak_550e8400.._Abc3Def4.."
```
```json
{
  "data": [{ "id": "...", "value": 123.45, "readingDate": "2026-06-05T...", "meter": {...} }],
  "meta": { "total": 30, "take": 20, "skip": 0 }
}
```

> ⚠️ A v1 hoje **não tem** endpoints de escrita (criar leitura, resetar senha, etc.) nem `apartments`/`blocks` diretos — só o que está na tabela acima. Se precisar disso via API Key, me avisa que eu adiciono.

---

## 2. API Interna (cookie de sessão) — usada pelo painel

Base: `/api/...` (mesmo domínio do sistema). Autenticação: fazer login em `POST /api/auth/login` grava um cookie `session` (JWT), que é enviado automaticamente pelo navegador (`withCredentials: true` em chamadas via `axios`).

### 2.1 Autenticação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → cookie de sessão + dados do usuário |
| POST | `/api/auth/logout` | Encerra a sessão |
| POST | `/api/auth/recover` | Recuperação de senha (envia e-mail com token) |
| POST | `/api/auth/signup` | Auto-cadastro (quando habilitado) |
| GET/PUT | `/api/auth/me` | Dados do usuário logado / atualizar perfil |
| GET/PUT | `/api/auth/me/preferences` | Preferências do usuário (medidores favoritos, etc.) |
| GET | `/api/auth/my-context` | Contexto de permissões do usuário logado (roles, condomínios vinculados) |

**Exemplo de login:**
```json
POST /api/auth/login
{ "email": "sindico@acquax.com.br", "password": "••••••••" }
```

### 2.2 Buscar unidade (Apartamentos)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/user/apartments` | Lista/busca unidades |
| POST | `/api/user/apartments` | Cria unidade(s) — aceita 1 ou lote |
| PUT | `/api/user/apartments/{entityId}` | Atualiza uma unidade |
| DELETE | `/api/user/apartments/{entityId}` | Remove (soft-delete) |
| POST | `/api/user/apartments/export` | Exporta lista (Excel) |

**Parâmetros de busca (GET):** `search`, `company_id`, `complex_id`, `block_id`, `apartment_id`, `with_block`, `with_complex`, `with_company` (traz dados relacionados), `take`, `skip`, `order_by`, `order_direction`.

```bash
GET /api/user/apartments?block_id=xxx&with_block=true&with_complex=true&take=20
```

### 2.3 Resetar login (redefinir acesso de um usuário)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/user/users/{entityId}/reset` | Redefine a senha do usuário — gera senha temporária OU aceita uma nova senha |
| POST | `/api/user/users/bulk-reset` | Reset em massa (vários usuários de uma vez) |

**Body (opcional):**
```json
{ "newPassword": "MinhaSenh@123", "mustUpdateCredentials": true }
```
Se `newPassword` não for enviado, o sistema **gera uma senha temporária automática** (formato `Acquax@XXXXXX`) e retorna no campo `tempPassword` — o usuário é obrigado a trocar no próximo login (`mustUpdateCredentials: true`).

> 🔒 Proteção: só quem tem permissão de sistema (`system`) pode resetar o `admin@acquax.com`.

```bash
curl -X POST /api/user/users/{id}/reset -H "Cookie: session=..." -d '{}'
```
```json
{
  "success": true,
  "user": { "id": "...", "name": "João", "email": "joao@..." },
  "tempPassword": "Acquax@F3K9QZ",
  "message": "Acesso restaurado. Senha temporária gerada — compartilhe com segurança."
}
```

### 2.4 Buscar medição (Medidores e Leituras)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/user/meters` | Lista/busca medidores |
| GET | `/api/user/meters/{entityId}` | Detalhe de um medidor |
| POST | `/api/user/meters` | Cria medidor(es) |
| PUT | `/api/user/meters/{entityId}` | Atualiza medidor |
| DELETE | `/api/user/meters/{entityId}` | Remove medidor |
| POST | `/api/user/meters/export` | Exporta lista |
| GET | `/api/user/readings` | Lista/busca leituras |
| POST | `/api/user/readings` | Cria leitura (unitária **ou em lote**, via `body.rows`) |
| PUT | `/api/user/readings/{id}` | Atualiza leitura |
| GET | `/api/user/readings/unlinked` | Leituras sem medidor vinculado |

**Parâmetros de busca de leituras (GET `/api/user/readings`):**
`id`, `company_id`, `complex_id`, `block_id`, `apartment_id`, `meter_id`, `is_pre_reading`, `from_date`, `to_date`, `with_meter`, `with_apartment`, `with_block`, `with_complex`, `with_device`, `search`, `take`, `skip`, `order_by`, `order_direction`.

**Parâmetros de busca de medidores (GET `/api/user/meters`):**
`id`, `company_id`, `complex_id`, `block_id`, `apartment_id`, `with_apartment`, `with_block`, `with_complex`, `with_type_meter`, `search`, `take`, `skip`.

```bash
GET /api/user/readings?meter_id=xxx&from_date=2026-06-01&to_date=2026-06-30&with_meter=true
```

### 2.5 Fazer levantamento (registrar/consultar leituras de consumo)

O "levantamento" mensal (tela `/levantamento`) tem duas partes:

**Consultar status do levantamento do mês:**
```
GET /api/meter-report?month=07&year=2026&complex_id=xxx
```
Retorna, por unidade, se já tem leitura lançada no mês, comparando com o(s) mês(es) anterior(es).

**Registrar leituras (lançar o levantamento):**

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/user/readings` (com `body.rows`) | Lançamento manual em lote pela tela de leituras |
| POST | `/api/user/readings/import-daily` | Importação de leituras diárias (formato `{ readings: [...] }`) |
| POST | `/api/user/readings/import-iot` | Importação vinda de dispositivos IoT (GroupLink) |
| GET/POST | `/api/user/dealership-reading` | Leitura da concessionária (relógio geral do condomínio) — base do rateio |
| POST | `/api/user/combined-import` | Importação combinada (planilha com leitura da concessionária + unidades no mesmo arquivo) |
| POST | `/api/user/import-medicao` | Importação do formato legado de planilha de medição |

**Exemplo — lançamento em lote:**
```json
POST /api/user/readings
{
  "rows": [
    { "meterId": "m1", "value": 1234.5, "readingDate": "2026-07-01" },
    { "meterId": "m2", "value": 987.0, "readingDate": "2026-07-01" }
  ],
  "allowUpdates": false,
  "complexId": "xxx"
}
```

**Exemplo — importação diária:**
```json
POST /api/user/readings/import-daily
{ "readings": [ { "meterSerial": "00123456", "value": 45.2, "date": "2026-07-01" } ] }
```

### 2.6 Outros recursos (referência rápida)

| Domínio | Rotas base |
|---|---|
| Condomínios | `GET/POST /api/user/complexes`, `PUT/DELETE /api/user/complexes/{id}`, `POST /api/user/complexes/export` |
| Blocos | `GET/POST /api/user/blocks`, `PUT/DELETE /api/user/blocks/{blockId}` |
| Empresas (Administradoras) | `GET/POST /api/user/companies`, `PUT/DELETE /api/user/companies/{id}` |
| Concessionárias | `GET/POST /api/user/dealerships` |
| Dispositivos IoT / GroupLink | `GET/POST /api/user/devices`, `.../devices/{id}`, `.../devices/{id}/meter-links`, `.../devices/{id}/reprocess-readings`, `.../devices/{id}/unlinked-readings` |
| Relatórios/Filipetas (billing) | `GET/POST /api/user/apartment-report`, `.../apartment-report/calculate`, `.../apartment-report/generate`, `.../apartment-report/unified` |
| Papéis e permissões | `GET/POST /api/user/roles`, `GET/POST /api/user/role-assignments`, `GET/POST /api/user/permissions` |
| Tipos de medidor | `GET/POST /api/user/type-meters` |
| Importação em massa (Usuários) | `POST /api/user/bulk-import/parse`, `POST /api/user/bulk-import/process` |
| Sugestões / Suporte | `GET/POST /api/user/suggestions`, `.../suggestions/{id}/vote`, `GET/POST /api/user/support`, `.../support/{ticketId}/messages` |
| Webhooks | `GET/POST /api/user/webhooks`, `GET/PATCH/DELETE /api/user/webhooks/{webhookId}` |
| API Keys (gerenciamento) | `GET/POST /api/user/api-keys`, `GET/PATCH/DELETE /api/user/api-keys/{keyId}`, `GET /api/user/api-keys/logs` |

### 2.7 Convenções gerais

- Todas as respostas de listagem seguem o padrão `{ list: [...], totalCount, hasNextPage, hasPreviousPage }` ou `{ data: [...], meta: {...} }` dependendo da rota.
- Soft-delete: registros deletados não somem do banco, só recebem `deletedAt`. As buscas já filtram isso automaticamente.
- Datas de filtro (`from_date`/`to_date`, `from`/`to`) são sempre ISO 8601 (`YYYY-MM-DD`).
- Erros seguem `{ error: "mensagem" }` com status HTTP apropriado (400, 401, 403, 404, 409, 500).

---

## Dúvidas / próximos passos
Se quiser, posso:
- Gerar uma **collection do Postman/Insomnia** pronta com todos esses endpoints.
- Adicionar endpoints de **escrita** na API v1 (hoje só leitura) pra uso externo com API Key.
- Documentar exemplos de resposta completos (JSON real) de cada rota.
