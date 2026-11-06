# AcquaXcontrol — Fluxograma e Mapa Completo do Sistema

> Documento gerado a partir do código-fonte em 06/11/2026.
> Cobre arquitetura, perfis, todas as telas, todos os fluxos, todas as rotas de API,
> entidades, serviços, integrações, automações e regras de negócio.
>
> Números do sistema nesta data: **54 páginas**, **135 rotas de API**, **36 entidades**,
> **8 automações agendadas (crons)**, **26 serviços de domínio**.

---

## 1. Visão geral

O AcquaXcontrol é a plataforma de gestão de medição de água (e gás/energia) da AcquaX do
Brasil. Ela recebe leituras de medidores (manuais, por planilha ou IoT), registra a conta
da concessionária, apura o consumo por unidade, calcula o rateio, gera extratos
(filipetas/levantamento) e comunica moradores e síndicos por e-mail e pelo painel.

| Camada | Tecnologia |
|---|---|
| Front-end / SSR | Next.js 15 (App Router), React, Tailwind, Shadcn UI, PWA com service worker |
| API | Route Handlers em `app/api/**` (Node runtime), autenticação por cookie de sessão JWT e API Key na v1 |
| Persistência | MongoDB (DigitalOcean) com Prisma 6 e middleware global de soft delete |
| Arquivos/fotos | Backblaze B2 via API S3, servido pelo CDN `cdn.acquaxcontrol.com.br` (Cloudflare) |
| E-mail | Zoho SMTP (`sistema@acquaxdobrasil.com.br`) com fila `EmailJob` drenada por cron |
| IoT | Integração GroupLink: arquivos em S3 (`events/`, `alarms/`) e API de dispositivos |
| IA | Mariana (assistente), Google Gemini |
| Hospedagem | Vercel (produção `www.acquaxcontrol.com.br`) |

### 1.1 Arquitetura macro

```mermaid
flowchart TB
  subgraph Atores
    MOR[Morador]
    SIN[Sindico / Administradora]
    ADM[Programador / Administrador]
    PAR[Parceiro / Sistema externo]
  end

  subgraph Front["Next.js 15 (PWA)"]
    PUB[Paginas publicas: login, cadastro por link, docs API]
    PAINEL[Painel autenticado 54 telas]
    SW[Service Worker / offline]
  end

  subgraph API["API (Route Handlers)"]
    AUTH[Auth e sessao]
    CORE[Cadastros e consumo]
    IOT[IoT / GroupLink]
    ADMAPI[Admin: fotos, GL, operacoes]
    ASSIST[Mariana]
    V1[API publica v1 + Swagger]
    CRON[Crons]
  end

  subgraph Dados
    DB[(MongoDB DigitalOcean)]
    CDN[(Backblaze B2 + CDN)]
  end

  subgraph Ext
    ZOHO[Zoho SMTP]
    GL[GroupLink S3]
    GEM[Google Gemini]
  end

  MOR --> PAINEL
  SIN --> PAINEL
  ADM --> PAINEL
  PAR --> V1
  PUB --> AUTH
  PAINEL --> AUTH
  PAINEL --> CORE
  PAINEL --> IOT
  PAINEL --> ASSIST
  PAINEL --> ADMAPI
  CORE --> DB
  IOT --> DB
  ADMAPI --> DB
  ASSIST --> GEM
  ASSIST --> DB
  V1 --> DB
  CRON --> DB
  CRON --> ZOHO
  CRON --> GL
  CORE --> CDN
  CORE --> ZOHO
```

---

## 2. Perfis de acesso e RBAC

O acesso não é definido por um campo no usuário: é definido por **vínculos (RoleAssignment)**
que ligam um usuário a um papel dentro de um contexto (sistema, empresa, condomínio, bloco
ou unidade). As permissões efetivas vêm do papel (`Role` → `Permission` com `entity` + `action`).

```mermaid
flowchart LR
  U[User] -->|1:N| RA[RoleAssignment]
  RA -->|roleId| R[Role]
  RA -->|contextType + contextId| CTX{Sistema / Empresa / Condominio / Bloco / Unidade}
  R -->|1:N| P[Permission entity+action]
  P --> UI[Menu, abas e botoes]
  P --> BE[Validacao no backend por escopo]
```

| Perfil | Como é identificado | Alcance típico |
|---|---|---|
| Morador | vínculo `apartment` | Própria unidade: consumo, filipeta, chamados |
| Síndico | vínculo `complex` ou `block` | Condomínio inteiro: leituras, contas, relatórios |
| Administradora | vínculo `company` | Carteira de condomínios |
| Programador | vínculo `system` | Operação e cadastros, sem excluir administrador |
| Administrador | vínculo `system` | Acesso total, incluindo exclusões sensíveis |

Regras relevantes:

- Menus e abas são filtrados por `lib/role-tab-config.ts` + `components/sidebar-permission-map.ts`.
- A API sempre revalida o escopo no servidor (`lib/userData.ts`, `lib/userContexts.ts`).
- O menu e a rota **Fotos de Medidor** (`/admin/fotos`) são restritos ao login `admin@acquax.com`
  (`PHOTO_ADMIN_EMAILS`), independentemente do papel.
- Programador não pode excluir nem alterar contas de Administrador.

---

## 3. Mapa de telas (54 páginas)

### 3.1 Público e autenticação

| Rota | Função |
|---|---|
| `/` | Redireciona para login ou dashboard |
| `/login` | Autenticação por e-mail e senha |
| `/first-access` | Primeiro acesso com senha provisória (troca obrigatória) |
| `/recover` | Recuperação de senha por e-mail |
| `/reset-password` | Definição de nova senha |
| `/signup` | Auto-cadastro público (quando habilitado) |
| `/cadastro/[token]` | Cadastro de morador por link do condomínio |
| `/suspended` | Aviso de condomínio suspenso |
| `/docs/api` | Documentação pública da API (Swagger) |
| `/politica-de-privacidade`, `/offline`, `/blog/post-1` | Conteúdo e fallback PWA |

### 3.2 Painel operacional

| Rota | Função |
|---|---|
| `/dashboard` | Visão inicial por perfil (admin, síndico, morador, programador) |
| `/dashboard/preview` | Pré-visualização do dashboard por papel |
| `/readings`, `/readings/create`, `/readings/[id]` | Leituras: lista, lançamento e edição |
| `/dealership-readings`, `/new`, `/[id]`, `/[id]/edit`, `/[id]/filipeta` | Contas da concessionária: cadastro, edição e filipeta |
| `/apartment-report`, `/[id]`, `/[id]/edit` | Relatórios de consumo por unidade |
| `/levantamento` | Levantamento comparativo por unidade e mês (impressão) |
| `/meter-report` | Extrato/filipeta por unidade (impressão e PDF) |
| `/consumption-dashboard` | Dashboards de consumo, área comum e comparativos |
| `/monitoring`, `/alerts` | Monitoramento IoT e alarmes |
| `/reservoirs`, `/reservoir-monitoring`, `/[id]` | Reservatórios e medidores de nível |
| `/apuracao` | Painel de apuração por condomínio (cobertura, última leitura) |

### 3.3 Cadastros e administração

| Rota | Função |
|---|---|
| `/companies` | Administradoras |
| `/complexes` | Condomínios (inclusive suspensão) |
| `/blocks`, `/apartments`, `/meters` | Blocos, unidades e medidores |
| `/devices` | Dispositivos IoT e vínculo com medidores |
| `/users`, `/roles`, `/role-customization` | Usuários, papéis, permissões e personalização de abas |
| `/links-cadastro` | Links públicos de cadastro por condomínio |
| `/gl-integration` | Integração GroupLink (status, importação retroativa) |
| `/api-manager` | Chaves de API, permissões, escopos, logs de uso e docs |
| `/admin/fotos` | Ferramenta de fotos de medidor (restrita ao admin) |
| `/api-docs` | Swagger da API v1 dentro do painel |

### 3.4 Comunicação e suporte

| Rota | Função |
|---|---|
| `/comunicado` | Comunicados para públicos segmentados |
| `/suporte` | Chamados (síndico/morador) e atendimento |
| `/sugestoes` | Sugestões e votos |
| `/guia` | Guia de uso da plataforma |
| `/account`, `/solutions` | Conta do usuário e página de soluções |

---

## 4. Fluxos detalhados

### 4.1 Autenticação e sessão

```mermaid
sequenceDiagram
  participant U as Usuario
  participant W as Next.js
  participant A as /api/auth
  participant D as MongoDB
  U->>W: informa e-mail e senha
  W->>A: POST /api/auth/login
  A->>D: User + RoleAssignment + Role/Permission
  A-->>W: JWT em cookie httpOnly
  W->>A: GET /api/auth/my-context
  A-->>W: isSystem, systemRoles, escopo, canManagePhotos
  W-->>U: menu e telas liberadas
```

- Senha provisória força troca no primeiro acesso (`/first-access`).
- Recuperação gera token por e-mail e leva a `/reset-password`.
- Sessão inválida no banco ainda é aceita se o JWT estiver válido (renovação transparente).
- Condomínio suspenso bloqueia o contexto (`/suspended`).
- `router`/middleware protegem o painel; `/docs`, `/swagger` e arquivos públicos passam direto.

### 4.2 Cadastro por link do condomínio

```mermaid
flowchart TD
  L[Link publico /cadastro/TOKEN] --> V{Token valido e ativo?}
  V -- nao --> E[Erro: link expirado]
  V -- sim --> F[Formulario: nome, email, celular, unidade]
  F --> G{Celular com 10+ digitos?}
  G -- nao --> F
  G -- sim --> H{Email ja existe?}
  H -- nao --> N[Cria usuario + senha provisoria]
  H -- sim --> R[Atualiza nome/celular, mantem senha]
  N --> RA[Cria RoleAssignment Morador na unidade]
  R --> RA
  RA --> EM[Enfileira boas-vindas / aviso de vinculo]
  EM --> OK[Tela de sucesso]
```

- `RegistrationInvite` guarda o token por condomínio; `RegistrationClaim` registra o uso.
- Reaproveitar usuário evita duplicidade e preserva a senha atual (orientação: "Esqueci minha senha").

### 4.3 Cadastro operacional

Ordem natural: **Administradora → Condomínio → Bloco → Unidade → Medidor → Dispositivo**.

- Medidor guarda a referência (`register`), que é a chave usada nas planilhas e no app de campo.
- `MeterDeviceLink` liga medidor a `IotDevice` (vínculo pode ser criado por importação de planilha).
- Unidade sem bloco é permitida (relação opcional) para bases legadas.

### 4.4 Entrada de leituras

```mermaid
flowchart TD
  subgraph Origens
    M[Digitacao manual /readings/create]
    P[Planilha /api/import-medicao]
    D[Planilha diaria /readings/import-daily]
    I[IoT GroupLink events/ arquivo S3]
    A[API v1 POST /readings]
  end
  M --> V[Validacao: medidor, data, duplicidade por mes/ano]
  P --> V
  D --> V
  I --> V
  A --> V
  V --> RD[(Reading)]
  RD --> UN{Medidor vinculado?}
  UN -- nao --> SAI[Leitura unlinked: /readings/unlinked]
  SAI --> VINC[Vincular device a medidor]
  VINC --> REP[Reprocessar leituras]
  UN -- sim --> OK[Disponivel para apuracao]
```

- Duplicidade: uma leitura por medidor por mês/ano (a API v1 recusa e devolve o ID existente).
- Leituras órfãs entram em fila de vinculação (`unlinked`) com reprocessamento em lote.
- Importações pesadas usam lotes (evita timeout de transação e OOM no MongoDB).

### 4.5 Conta da concessionária e apuração

```mermaid
flowchart TD
  C[Conta do mes: agua, esgoto, area comum, total, tarifa] --> VAL{Tarifa preenchida?}
  VAL -- nao --> BLOQ[Bloqueado: tarifa obrigatoria]
  VAL -- sim --> DR[(DealershipReading)]
  DR --> MOD[Modelo de calculo do condominio]
  MOD --> CALC{Apuracao}
  CALC --> IMP[Importacao combinada de planilha]
  CALC --> GEN[Geracao de relatorios por unidade]
  CALC --> UNI[Edicao unificada de um relatorio]
  IMP --> ACR[(ApartmentConsumptionReport)]
  GEN --> ACR
  UNI --> ACR
  ACR --> LEV[/levantamento e /meter-report/]
  ACR --> FLP[Filipeta PDF e e-mail]
  ACR --> DASH[Dashboards de consumo]
```

Regras conhecidas:

- A conta define água, esgoto, área comum (`diffCost`), carro-pipa e total.
- O relatório por unidade guarda `consumptionCost` (água), `sewageCost` (esgoto),
  `partial` (rateio de área comum), `kiteCarCost` e `totalUnit`.
- `totalUnit` deve ser igual à soma das parcelas. Quando a planilha traz o total com rateio
  mas deixa a coluna de rateio vazia, a diferença fica escondida dentro de água/esgoto e o
  Levantamento (que mostra Água/Esgoto = total − área comum) exibe o total na linha errada.
- A edição de um relatório reativa automaticamente leitura removida em reprocessamento
  (soft deleted) e grava `monthRef`/`yearRef` do relatório.

### 4.6 Motor de cálculo e rateio

| Item | Como funciona |
|---|---|
| Tarifas | Faixas progressivas por m³ (`MANUAL_MONTHLY`, `CALCULATED` ou `FIXED`) |
| Esgoto | Percentual sobre o valor da água (varia por modelo) |
| Área comum | `NONE`, `EQUAL` (igualitário), `FRACTION` (fração ideal), `PROPORTIONAL`, `INVERSE_PROPORTIONAL` |
| Carro-pipa | Consumo e custo rateados conforme o modelo |
| Extras | Taxas administrativas, fundos e encargos por modelo |
| Origem | Modelos reutilizáveis vinculados a um ou vários condomínios |

### 4.7 Filipeta, levantamento e relatórios

```mermaid
flowchart LR
  ACR[(ApartmentConsumptionReport)] --> FL[Filipeta por unidade]
  ACR --> LEV[Levantamento por condominio e mes]
  ACR --> ANU[Consumo anual e comparativos]
  FL --> PDF1[PDF / impressao]
  LEV --> PDF2[PDF / impressao]
  FL --> EMJ[EmailJob categoria filipeta]
  EMJ --> CRON[Cron send-pending-emails]
  CRON --> ZOHO[Zoho SMTP]
```

- Geração oficial pelas abas `/meter-report` (filipeta) e `/levantamento` (planilha comparativa).
- Envios em massa passam pela fila; reset de senha e boas-vindas individuais são imediatos.

### 4.8 Comunicação por e-mail

```mermaid
flowchart TD
  EV[Evento: relatorio salvo, alerta, reset, boas-vindas, resumo] --> Q{Fluxo}
  Q -- individual --> DIR[Envio imediato SMTP]
  Q -- lote --> JOB[(EmailJob)]
  JOB --> PRIO[Prioridade: reset 0, boas-vindas 2, filipeta 5]
  PRIO --> CRON[Cron a cada 5 min]
  CRON --> RITMO[Espacamento aleatorio 25-90s, teto 60/h, orcamento 250s]
  RITMO --> SMTP[Zoho SMTP]
  SMTP --> LOG[Status: sent, failed, skipped]
  LOG --> SAUDE[/api/debug/emails e /email-status/]
```

- Domínios internos (`@acquax*`) são marcados como `skipped` (economia de cota).
- Bloqueio antispam do Zoho: a fila pausa e devolve a tentativa, não queima o job.
- Categorias permitem ver, na saúde do e-mail, o que é fila e o que foi imediato.

### 4.9 Automações agendadas (crons)

| Cron | Frequência | O que faz |
|---|---|---|
| `/api/cron/gl-import` | 10h e 22h | Importa leituras do GroupLink (S3) |
| `/api/cron/send-pending-emails` | a cada 5 min | Drena a fila `EmailJob` com ritmo humano |
| `/api/cron/check-consumption-goals` | diário 8h | Verifica metas de consumo por unidade |
| `/api/cron/leak-detection` | segunda 8h | Detecta vazamento por consumo atípico |
| `/api/cron/send-alert-summary` | segunda 9h | Resumo de alertas para síndicos |
| `/api/cron/send-monthly-summary` | dia 5, 10h | Resumo mensal do condomínio |
| `/api/cron/cleanup-soft-deleted` | dia 1, 3h | Inventário de registros removidos (não destrutivo) |

### 4.10 Fotos de medidor

```mermaid
flowchart LR
  U[/admin/fotos/] --> S[Seleciona condominio, mes e unidade]
  S --> UP[Upload da imagem]
  UP --> SH[Redimensiona 1600px, JPEG q82]
  SH --> B2[(Backblaze B2)]
  B2 --> CDN[cdn.acquaxcontrol.com.br]
  CDN --> URL[urlCover na leitura do mes]
  U --> LOTE[Envio em lote por nome do arquivo]
  LOTE --> UP
```

- Se a leitura já tem link do CDN, o arquivo é sobrescrito na mesma chave (o link não muda).
- Sem link anterior, o caminho é `<CONDOMINIO>/<ANO>/<MM - Mes>/Fotos/<unidade>.jpg`.
- Leitura removida em reprocessamento recebe o link sem ser reativada.
- Acesso restrito a `admin@acquax.com` (menu oculto para os demais).

### 4.11 API pública v1

```mermaid
sequenceDiagram
  participant P as Parceiro
  participant V1 as /api/v1
  participant K as ApiKey
  participant D as MongoDB
  P->>V1: Authorization Bearer ak_uuid_segredo
  V1->>K: valida hash, status, validade, IP, escopo
  K-->>V1: permissoes e scopeComplexId
  V1->>D: consulta limitada pelo escopo
  V1-->>P: JSON + meta de paginacao
  V1->>K: ApiLog (uso, latencia, status)
```

| Recurso | Endpoints |
|---|---|
| Status | `GET /api/v1` |
| Cadastros | `GET /complexes`, `/apartments`, `/meters` |
| Leituras | `GET /readings`, `POST /readings` (ate 200 por lote) |
| Relatórios | `GET /reports` (mês e ano obrigatórios) |
| Usuários | `GET /users`, `POST /users/{id}/reset` |

- Documentação: `/docs/api` (pública, Swagger), `/api-docs` (painel) e `/api/openapi.yaml`.
- Guia em PDF para parceiros: `docs/API-PARCEIROS.pdf`.

### 4.12 Mariana (assistente de IA)

```mermaid
flowchart TD
  U[Pergunta no painel] --> CHAT[/api/assistant/chat/]
  CHAT --> CTX[Contexto do vinculo: condominio e unidade]
  CTX --> GEM[Gemini]
  GEM --> TOOLS{Ferramentas}
  TOOLS --> T1[minha_unidade / meu_historico_consumo]
  TOOLS --> T2[minha_filipeta / gerar_relatorio]
  TOOLS --> T3[unidades_sem_leitura / meus_chamados]
  TOOLS --> T4[abrir_chamado / alterar_meu_email / como_acessar]
  TOOLS --> R[Resposta]
  R --> AUD[(AssistantLog)]
  R --> FB[(AssistantFeedback)]
  AVISOS[/api/assistant/avisos/] --> U
```

- Sempre no escopo do usuário; nunca mostra dado de outra unidade.
- Histórico e análises usam 3 meses por padrão.
- Pergunta o bloco quando a unidade existe em mais de um bloco.
- Filipeta e levantamento são gerados pelas abas oficiais da plataforma.

### 4.13 Suporte, sugestões e comunicados

```mermaid
flowchart LR
  M[Morador] --> T[SupportTicket + SupportMessage]
  S[Sindico] --> T
  T --> AT[Atendimento no painel]
  M --> SG[Suggestion]
  SG --> VO[SuggestionVote]
  ADM[Admin] --> CM[Comunicado]
  CM --> AUD[Publico: moradores, sindicos, administradoras, condominio]
  CM --> EM[EmailJob / aviso no painel]
```

---

## 5. Entidades (36 modelos)

```mermaid
erDiagram
  Company ||--o{ Complex : possui
  Complex ||--o{ Block : divide
  Block ||--o{ Apartment : contem
  Complex ||--o{ Apartment : agrega
  Apartment ||--o{ Meter : mede
  Meter ||--o{ Reading : registra
  Meter ||--o{ MeterDeviceLink : vincula
  IotDevice ||--o{ MeterDeviceLink : conecta
  Complex ||--o{ DealershipReading : conta
  DealershipReading ||--o{ ApartmentConsumptionReport : apura
  Apartment ||--o{ ApartmentConsumptionReport : recebe
  Complex ||--o{ Reservoir : tem
  Reservoir ||--o{ ReservoirReading : mede
  User ||--o{ RoleAssignment : assume
  Role ||--o{ RoleAssignment : define
  Role ||--o{ Permission : permite
  User ||--o{ ApiKey : emite
  ApiKey ||--o{ ApiLog : registra
  User ||--o{ SupportTicket : abre
  SupportTicket ||--o{ SupportMessage : contem
  User ||--o{ Suggestion : envia
  Suggestion ||--o{ SuggestionVote : vota
  Complex ||--o{ RegistrationInvite : gera
  RegistrationInvite ||--o{ RegistrationClaim : usa
  Webhook ||--o{ WebhookDelivery : entrega
```

| Grupo | Entidades |
|---|---|
| Pessoas e acesso | `User`, `Session`, `Role`, `Permission`, `RoleAssignment` |
| Locais | `Company`, `Complex`, `Block`, `Apartment` |
| Medição | `TypeMeter`, `Meter`, `IotDevice`, `MeterDeviceLink`, `Reading` |
| Faturamento | `Dealership`, `DealershipReading`, `ApartmentConsumptionReport` |
| Reservatórios | `Reservoir`, `ReservoirReading` |
| Agenda | `ScheduledTask`, `RecurringSchedule`, `ScheduleOverride` |
| Atendimento | `SupportTicket`, `SupportMessage`, `Suggestion`, `SuggestionVote` |
| Integrações | `ApiKey`, `ApiLog`, `Webhook`, `WebhookDelivery`, `GlImportLog`, `GlAlarm` |
| Comunicação | `EmailJob`, `Comunicado` |
| Cadastro público | `RegistrationInvite`, `RegistrationClaim` |

---

## 6. Todas as rotas de API (135)

### 6.1 Autenticação e sessão

| Métodos | Rota |
|---|---|
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/recover`, `/api/auth/reset-password`, `/api/auth/session`, `/api/auth/signup` |
| GET, PUT | `/api/auth/me`, `/api/auth/me/preferences` |
| GET | `/api/auth/my-context` |

### 6.2 Consumo (leituras, contas, relatórios)

| Métodos | Rota |
|---|---|
| GET, POST | `/api/user/readings` |
| PUT | `/api/user/readings/[id]` |
| GET | `/api/user/readings/unlinked` |
| POST | `/api/user/readings/import-daily`, `/api/user/readings/import-iot` |
| POST | `/api/user/import-medicao` |
| GET, POST | `/api/user/dealership-reading` |
| PUT, DELETE | `/api/user/dealership-reading/[entityId]` |
| GET, POST | `/api/user/apartment-report` |
| PUT, DELETE | `/api/user/apartment-report/[entityId]` |
| POST | `/api/user/apartment-report/calculate`, `/generate`, `/unified` |
| POST | `/api/user/combined-import` |
| GET | `/api/meter-report`, `/api/dealership-readings/[id]/filipeta` |

### 6.3 IoT e dispositivos

| Métodos | Rota |
|---|---|
| GET, POST | `/api/user/devices` |
| PUT, DELETE | `/api/user/devices/[id]` |
| GET | `/api/user/devices/devices-list`, `/[id]/meter-links`, `/[id]/unlinked-readings` |
| POST | `/api/user/devices/[id]/reprocess-readings` |
| POST | `/api/user/devices/meter-links` |
| PUT, DELETE | `/api/user/devices/meter-links/[linkId]` |
| POST | `/api/user/devices/import-links/validate`, `/import-links/process` |
| GET | `/api/user/devices/unlinked-readings`, `/with-unlinked-readings` |
| GET | `/api/gl-status`, `/api/admin/gl/diagnostics`, `/api/admin/gl/alarms` |
| POST, GET | `/api/admin/gl/retroactive-import`, `/set-meter-ids`, `/temp-retro-import`, `/update-meter-glids` |
| POST | `/api/monitoring/readings`, `/api/monitoring/alerts` |

### 6.4 Cadastros

| Métodos | Rota |
|---|---|
| GET, POST | `/api/user/companies`, `/api/user/type-meters`, `/api/user/dealerships` |
| PUT, DELETE | `/api/user/companies/[entityId]` |
| GET, POST | `/api/user/complexes` |
| PUT, DELETE | `/api/user/complexes/[entityId]` |
| PATCH | `/api/user/complexes/[entityId]/suspend` |
| POST | `/api/user/complexes/export`, `/api/user/blocks/export`, `/api/user/apartments/export`, `/api/user/meters/export` |
| GET, POST | `/api/user/blocks`, `/api/user/apartments`, `/api/user/meters` |
| PUT, DELETE | `/api/user/blocks/[blockId]`, `/api/user/apartments/[entityId]`, `/api/user/meters/[entityId]` |
| GET, POST | `/api/reservoirs`, `/api/reservoir-readings` |
| GET, PUT, DELETE | `/api/reservoirs/[id]` |
| POST, DELETE | `/api/reservoirs/[id]/link` |
| GET | `/api/reservoirs/unlinked` |

### 6.5 Usuários, papéis e permissões

| Métodos | Rota |
|---|---|
| GET, POST | `/api/user/users`, `/api/user/roles`, `/api/user/permissions`, `/api/user/role-assignments` |
| PUT, DELETE | `/api/user/users/[entityId]`, `/api/user/roles/[entityId]`, `/api/user/permissions/[entityId]` |
| DELETE | `/api/user/role-assignments/[entityId]` |
| POST | `/api/user/users/[entityId]/reset`, `/api/user/users/bulk-reset`, `/api/user/users/export` |
| POST | `/api/user/bulk-import/parse`, `/api/user/bulk-import/process` |
| GET | `/api/user-permissions` |
| GET, POST | `/api/user/registration-invites` |
| PATCH | `/api/user/registration-invites/[id]` |
| GET, POST | `/api/public/register/[token]` |

### 6.6 Comunicação, suporte e conteúdo

| Métodos | Rota |
|---|---|
| GET, POST | `/api/user/comunicados`, `/api/user/support`, `/api/user/suggestions` |
| GET, DELETE | `/api/user/comunicados/[id]` |
| GET, PATCH | `/api/user/support/[ticketId]` |
| POST | `/api/user/support/[ticketId]/messages` |
| PATCH, DELETE | `/api/user/suggestions/[suggestionId]` |
| POST | `/api/user/suggestions/[suggestionId]/vote` |
| GET, POST | `/api/user/webhooks` |
| GET, PATCH, DELETE | `/api/user/webhooks/[webhookId]` |

### 6.7 E-mail e notificações

| Métodos | Rota |
|---|---|
| GET | `/api/user/email-status`, `/api/user/send-test-email`, `/api/user/send-welcome-email` |
| POST | `/api/user/trigger-emails` |
| GET | `/api/debug/emails` |

### 6.8 API pública, documentação e administração

| Métodos | Rota |
|---|---|
| GET | `/api/v1`, `/api/v1/complexes`, `/api/v1/apartments`, `/api/v1/meters`, `/api/v1/readings`, `/api/v1/reports`, `/api/v1/users` |
| POST | `/api/v1/readings`, `/api/v1/users/[id]/reset` |
| GET | `/api/openapi.yaml` |
| GET, POST | `/api/user/api-keys` |
| GET, PATCH, DELETE | `/api/user/api-keys/[keyId]` |
| GET | `/api/user/api-keys/logs` |
| GET, POST | `/api/admin/photos` |
| GET | `/api/admin-stats`, `/api/admin/operations/summary`, `/api/apuracao` |
| GET, POST | `/api` (índice) |

### 6.9 Assistentes, dashboard e diagnóstico

| Métodos | Rota |
|---|---|
| GET, POST | `/api/assistant/chat` |
| POST | `/api/assistant/consumo`, `/api/assistant/feedback` |
| GET | `/api/assistant/avisos`, `/api/assistant/relatorio` |
| GET | `/api/dashboard/annual-consumption`, `/api/dashboard/common-area`, `/api/dashboard/consumption-analysis`, `/api/block-comparison` |
| GET | `/api/health`, `/api/debug` |

### 6.10 Crons

`/api/cron/gl-import`, `/api/cron/send-pending-emails`, `/api/cron/check-consumption-goals`,
`/api/cron/leak-detection`, `/api/cron/send-alert-summary`, `/api/cron/send-monthly-summary`,
`/api/cron/cleanup-soft-deleted`.

---

## 7. Serviços de domínio (26)

| Serviço | Responsabilidade |
|---|---|
| `calculation-model-parser` | Lê planilha modelo e extrai faixas, esgoto, área comum |
| `combined-import-service` | Importação combinada de medição + faturamento |
| `medicao-parser` | Normaliza colunas da planilha de medição |
| `iot-reading-service` | Converte eventos do GroupLink em leituras |
| `gl-import-service` / `gl-alarm-import-service` | Importação de leituras e alarmes do S3 |
| `device-management-service` | Dispositivos, vínculos e reprocessamento |
| `reading-link-service` | Liga leitura órfã ao medidor correto |
| `reading-fast-reprocess-service` | Reprocessa leituras em lote |
| `consumption-analysis` | Comparativos e séries de consumo |
| `latest-report-by-complex` | Último relatório por condomínio (consultas rápidas) |
| `email-service` / `email-queue` | SMTP e fila `EmailJob` |
| `email-queue-trigger` | Dispara a fila após eventos |
| `filipeta-email-dispatcher` / `filipeta-email-template` | Monta e envia filipetas |
| `welcome-email-template` / `transactional-email-templates` | Templates de boas-vindas e transacionais |
| `management-insights-email` | Insights gerenciais para síndicos |
| `notification-recipients` | Resolve destinatários por público |
| `leak-detection-service` | Detecção de vazamento |
| `suspension-service` | Suspensão de condomínio e bloqueio de acesso |
| `photo-storage` | Upload para B2 e montagem de URL do CDN |
| `assistant/*` | Mariana: prompt, ferramentas, Gemini, auditoria, avisos |

---

## 8. Integrações e variáveis de ambiente

| Integração | Variáveis principais | Uso |
|---|---|---|
| Banco | `DATABASE_URL` | MongoDB de produção |
| Sessão | `JWT_SECRET` | Assinatura do cookie de sessão |
| Zoho SMTP | `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `ZOHO_SMTP_USER`, `ZOHO_SMTP_PASS`, `ZOHO_SMTP_FROM_NAME` | Envio de e-mails |
| GroupLink S3 | `GL_S3_REGION`, `GL_S3_ACCESS_KEY_ID`, `GL_S3_SECRET_ACCESS_KEY`, `GL_S3_BUCKET`, `GL_S3_PATH_PREFIX` | Leituras e alarmes IoT |
| Fotos (B2) | `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION` | Upload das fotos de medidor |
| Fotos (acesso) | `PHOTO_ADMIN_EMAILS` | Quem vê e usa `/admin/fotos` |
| IA | `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`), `GEMINI_MODEL` | Mariana |
| Fila de e-mail | `EMAIL_GAP_MIN_MS`, `EMAIL_GAP_MAX_MS`, `EMAIL_RUN_BUDGET_MS`, `EMAIL_HOURLY_LIMIT` | Ritmo de envio |
| Manutenção | `ENABLE_HARD_PURGE` | Purga definitiva de soft deleted |

---

## 9. Regras e invariantes do sistema

1. **Soft delete global**: o middleware de `lib/prisma.ts` injeta `deletedAt` nas consultas;
   modelos sem o campo precisam estar em `MODELS_WITHOUT_DELETED_AT`.
2. **Consultas por e-mail/nome**: usar `findFirst` com `deletedAt: null`, nunca `findUnique`
   em campo que participa de índice único composto.
3. **Filtros de texto**: usar `contains` em vez de `startsWith` (caracteres como `[` quebram no MongoDB).
4. **Tarifa obrigatória** no cadastro da conta/concessionária.
5. **Uma leitura por medidor por mês/ano** (a segunda é recusada com o ID existente).
6. **Relações opcionais no schema** quando o dado legado pode não existir (bloco, medidor).
7. **Importações em lote** (evita timeout de transação e OOM).
8. **Rateio**: `totalUnit = consumptionCost + sewageCost + partial + kiteCarCost`.
9. **Paginação sem truncar**: listas de condomínios não cortam carteiras grandes.
10. **CSP restritiva**: scripts apenas do próprio domínio (Swagger e afins são servidos localmente).

### 9.1 Pontos de atenção conhecidos

| Tema | Situação |
|---|---|
| Área comum zerada em importações antigas | Capri 06 a 10/2026 com `partial = 0` e total contendo rateio (ex.: unidade 406 em 10/2026, R$ 43,90) |
| Leituras com `monthRef` por extenso | Registros antigos usam "Outubro"; filtros por período devem usar `from`/`to` |
| Relatórios apontando para leituras removidas | ~2.024 em 2026; a edição reativa automaticamente |
| Bloqueio antispam Zoho | Filas pausam e retomam sem queimar tentativas |
| Service worker | Pode servir versão anterior do front até atualizar o cache |
| Índices do MongoDB | Reavaliar `Readings` após período estável de uptime |

---

## 10. Observabilidade

| Recurso | O que mostra |
|---|---|
| `/api/health` | Saúde do app e do banco (200 ok, 503 degraded) |
| `/api/debug` | Informações de diagnóstico do ambiente |
| `/api/debug/emails` e `/api/user/email-status` | Fila de e-mail, categorias, falhas e próximos envios |
| `/api/gl-status` e `/admin/gl/diagnostics` | Conexão e arquivos do GroupLink |
| `/api/admin-stats` e `/api/admin/operations/summary` | Números operacionais do sistema |
| `ApiLog` | Uso, latência e status de cada chamada da API pública |
| `AssistantLog` / `AssistantFeedback` | Conversas da Mariana e avaliações |

---

## 11. Glossário rápido

- **Medidor (Meter)**: equipamento físico de uma unidade, identificado por `register`.
- **Leitura (Reading)**: valor lido em um medidor em uma data.
- **Conta (DealershipReading)**: fatura da concessionária do mês para o condomínio.
- **Relatório (ApartmentConsumptionReport)**: consumo e valores de uma unidade no mês.
- **Rateio / área comum**: parte da conta distribuída entre as unidades.
- **Filipeta**: extrato individual da unidade.
- **Levantamento**: planilha comparativa de várias unidades e meses.
- **GL (GroupLink)**: fornecedor de telemetria dos medidores.
