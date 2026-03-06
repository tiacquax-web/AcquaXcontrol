# Integracao IA - Acesso ao Banco (MongoDB)

## Objetivo
Documentar o acesso solicitado pela empresa de IA para automatizar atendimento com base nas informacoes ja existentes no sistema (planilha importada, relatorios, leituras, fotos e dados da filipeta).

## Resumo tecnico (do projeto)
- Banco: MongoDB via Prisma (ver `prisma/schema.prisma`, datasource `provider = "mongodb"`).
- O dado da planilha NAO fica salvo como planilha. Ele vira registros em:
  - `Readings` (leituras de medidores)
  - `ApartmentConsumptionReports` (relatorios de consumo)
- A filipeta e montada pela API `GET /api/dealership-readings/[id]/filipeta` e usa:
  - `ApartmentConsumptionReports` + `Reading` (lastReading)
  - `Apartment` -> `Block` -> `Complex` -> `Company`
  - `DealershipReading`

## Dados necessarios para a IA responder clientes
### 1) Dados de contexto (quem e onde)
Colecoes:
- `Companies` (model `Company`)  
  Campos usados na filipeta: `socialName`, `street`, `number`, `city`, `state`.
- `Complexes` (model `Complex`)  
  Campos usados: `socialName`.
- `Blocks` (model `Block`)  
  Campos usados: `name`.
- `Apartments` (model `Apartment`)  
  Campos usados: `name`, `blockId`, `complexId`, `companyId`.

### 2) Dados da conta/periodo (relatorio de consumo)
Colecao:
- `ApartmentConsumptionReports` (model `ApartmentConsumptionReport`)  
  Campos usados na filipeta e atendimento:
  - `monthRef`, `yearRef`
  - `consumption`, `totalConsumption`
  - `consumptionCost`, `sewageCost`, `partial`, `totalUnit`
  - `kiteCarConsumption`, `kiteCarCost`
  - `consumptionGasValue`, `totalGasValue`
  - `lastReadingId`
  - `dealershipReadingId`
  - `apartmentId`, `blockId`, `complexId`, `companyId`

### 3) Dados de leitura e foto do medidor
Colecao:
- `Readings` (model `Reading`)  
  Campos usados:
  - `reading`, `readAtDate`, `nextReadingDate`
  - `urlCover` (URL da foto)
  - `registerName`, `meterId`, `apartmentId`, `blockId`, `complexId`, `companyId`

### 4) Dados da concessionaria (para periodo e totals)
Colecao:
- `DealershipReadings` (model `DealershipReading`)  
  Campos usados:
  - `type`, `readingDate`, `readingDateNext`, `totalDays`
  - `dealershipConsumption`, `monthlyConsumption`, `billedConsumption`
  - `consumptionValue`, `sewageValue`, `totalValue`
  - `monthRef`, `yearRef`, `complexId`, `companyId`

### 5) Dados de medidor
Colecao:
- `Meters` (model `Meter`)  
  Campos usados:
  - `register`, `apartmentId`

## Observacoes sobre "planilha"
- A planilha e somente um meio de entrada.  
- Depois da importacao, a IA deve ler `Readings` e `ApartmentConsumptionReports`.

## Permissoes (estado atual)
- O acesso sera direto ao banco.
- **DigitalOcean permite apenas o usuario read-only preconfigurado.**
- Portanto, **passaremos o acesso com o usuario `do-readonly`**.
- Nao ha criacao de novos usuarios/roles read-only customizados no provedor.

### Escopo efetivo
- Leitura total no banco pelo usuario `do-readonly` (limitacao imposta pelo provedor).
- Continuamos evitando compartilhar colecoes de autenticacao em documentacao, mas o controle efetivo e global.

### Escopo por empresa/condominio (recomendado)
- Banco nao tem Row-Level Security nativo. Para limitar por `companyId`/`complexId`:
  - Criar **views** no MongoDB com `match` fixo por `companyId` e dar `read` apenas na view.
  - Alternativa: DB separado por cliente (se for multi-tenant).

## LGPD e dados sensiveis
- O fluxo da filipeta nao exige dados pessoais de usuario (email, telefone, documento).  
- Evitar compartilhar colecoes com PII (`Users`).
- Se a IA precisar de identificacao de morador, documentar campos exatos antes de liberar.

## Checklist de aprovacao
1. Escopo limitado (colecoes e campos) definido.
2. Acesso confirmado com `do-readonly` (somente leitura).
3. Logs de acesso da IA habilitados (ideal no lado API).
4. Termo de tratamento de dados e SLA de seguranca acordados.

## Operacional (acesso direto ao DB)
- Usar o usuario `do-readonly` (unico read-only permitido pelo provedor).
- Restringir acesso por IP fixo ou VPN (no painel DigitalOcean).
- Credenciais exclusivas para a empresa de IA (sem compartilhamento interno).
- Rotacao periodica de senha/keys e revogacao imediata em caso de incidente.
- Habilitar logs/auditoria de acesso no MongoDB e revisar periodicamente.
- Proibir exportacoes massivas nao autorizadas e definir limite de volume.

## Passo a passo (mongosh) - acesso com `do-readonly`
> Substitua `DB_NAME`, `<PASS>` e `<HOST>` pelos valores reais.

1. Conectar ao cluster:
```bash
mongosh "mongodb+srv://do-readonly:<PASS>@<HOST>/<DB_NAME>?retryWrites=true&w=majority"
```

2. Selecionar o banco:
```javascript
use DB_NAME
```

3. Testar acesso (exemplo):
```javascript
db.Companies.findOne()
db.ApartmentConsumptionReports.findOne()
```

## Teste de read-only (mongosh)
> Use um usuario supostamente read-only e valide que operacoes de escrita falham.
> ATENCAO: se algum comando passar, apague o registro logo em seguida.

```javascript
use DB_NAME

// 1) Tentar criar (insert) em colecao real do schema
db.Dealerships.insertOne({
  name: "READONLY_TEST",
  service: "READONLY_TEST",
  editor: "READONLY_TEST",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null
})

// 2) Tentar editar (update)
db.Dealerships.updateOne(
  { name: "READONLY_TEST", service: "READONLY_TEST" },
  { $set: { editor: "READONLY_UPDATED" } }
)

// 3) Tentar excluir (delete)
db.Dealerships.deleteOne({ name: "READONLY_TEST", service: "READONLY_TEST" })
```

---

Referencias no codigo:
- `prisma/schema.prisma`
- `app/api/dealership-readings/[id]/filipeta/route.ts`
- `components/dealership-reading/FilipetaGridReport.tsx`
- `docs/combined-import-guide.md`