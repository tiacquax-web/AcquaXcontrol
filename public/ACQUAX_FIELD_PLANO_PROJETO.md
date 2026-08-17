# AcquaX Field — Plano Completo do Projeto
**Versão 2.0 — Março 2026**
**Documento de Planejamento Técnico e Estratégico**

---

## 1. Visão Geral do Produto

**AcquaX Field** é um sistema paralelo e interoperável com o **AcquaXControl**, projetado para:

- Automatizar a leitura de hidrômetros via câmera + IA (OCR)
- Suportar múltiplos modelos de cobrança cadastráveis e configuráveis por condomínio/mês
- Gerenciar o fluxo completo: rota de leitura → conferência → planilha → PDFs → envio automático
- Gerar Ordem de Serviço digital com assinatura
- Ser instalável como PWA em PC, Android e Apple (iOS)

### 1.1 Nome e Identidade
- **Nome do produto**: AcquaX Field
- **Relação com AcquaXControl**: sistema irmão, API-interoperável
- **Plataformas**: PWA (Web + Android + iOS) — mesma codebase
- **Stack**: Next.js 15, MongoDB, Vercel, Cloudflare R2, Zoho ZeptoMail

---

## 2. Perfis de Usuário (5 Perfis)

| Perfil | Função Principal | Permissões Críticas |
|--------|-----------------|---------------------|
| **Admin** | Supervisão geral, pode operar câmera | Tudo + executar câmera + visualizar OS |
| **Analista** | Processa consumos, fecha planilha, aprova envio | **Criar/editar condomínios**, verificar fotos, lançar conta, validar planilha, aprovar envio, visualizar OS |
| **Leiturista** | Executa rota de leitura com câmera | Ver rota, tirar foto, confirmar leitura, assinar OS |
| **Síndico** | Acompanhamento do condomínio | Ver planilha final, PDFs, status leitura, visualizar OS (somente leitura) |
| **Morador** | (herdado AcquaXControl) | Ver própria unidade |

### 2.1 Clarificações de Perfil (v2)
- **Analista** é o perfil NOVO. Ele cria e edita condomínios, e é **responsável por aprovar o envio** da planilha mensal.
- **Admin** pode operar câmera (tirar fotos de hidrômetro) — diferencial em relação ao AcquaXControl.
- **Leiturista** segue rota com câmera e assina OS digitalmente ao finalizar.
- **Síndico** visualiza tudo, mas **não edita nada**.
- OS assinada = **imutável para todos**, inclusive Admin.

---

## 3. Células Amarelas (Campos de Entrada por Mês)

Com base na análise das 5 planilhas reais, as **células amarelas na aba INFORMAÇÕES** são os únicos campos que o analista preenche manualmente a cada mês. O sistema deve replicar exatamente essa lógica.

### 3.1 Campos Amarelos Comuns a Todos os Modelos

| Campo | Célula | Descrição |
|-------|--------|-----------|
| Mês de referência | B6 | ex: "JANEIRO", "FEVEREIRO" |
| Concessionária | F6 | ex: "Águas do Rio", "SABESP" |
| Data de leitura atual | B7 | DD/MM/AAAA |
| Conta total | F7 | `=SUM(F11:F14)` — calculada automaticamente |
| Data leitura anterior | B8 | DD/MM/AAAA |
| Consumo real m³ | F8 | Valor da fatura da concessionária |
| Data leitura prevista | B9 | DD/MM/AAAA |
| Modalidade | F9 | ex: "MÍNIMO", "REAL CONSUMO" |
| Vencimento da conta | F10 | DD/MM/AAAA |
| Recursos hídricos | F11 | Valor fixo da conta |
| Multas/juros ou parcelamento | F12 | Valor variável (pode ser 0) |
| Valor Água | F13 | Valor da fatura |
| Valor Esgoto | F14 | Geralmente `=F13` (100% sobre água) |

### 3.2 Campos Amarelos Específicos por Modalidade

**MÍNIMO** (América Clube, Flamboyant):
- B26: Tarifa m³ (ex: 6,564 para Águas do Rio; 6,0037 para IGUÁ)
- B27: `=B26` (esgoto igual à água)

**REAL CONSUMO** (Diamantina – SABESP):
- B26: Tarifa faixa 1 (0–10 m³) = `=4.04*2`
- B27: Tarifa faixa 2 (11–20 m³) = 12,80
- B28: Tarifa faixa 3 (21–50 m³) = `=15.95*2`
- B29: Tarifa faixa 4 (>50 m³) = `=17.57*2`
- B30–B32: faixas adicionais (vazias neste mês)

**PROGRESSIVIDADE** (Bosque Araguaia):
- B26: Tarifa faixa 1 (0–15 m³) = 6,8778
- B27: Tarifa faixa 2 (>15 m³) = 15,1311
- B21: Desconto fixo por unidade = `=9.92/118`

**M³ MÉDIO** (Itatiaia):
- F7: `=SUM(F11:F15)-6.79` (subtrai crédito automaticamente)
- F12: Multa/juros = `=155.94+7.56+23.58`
- F13: Taxa do lixo = 6,55
- F17: Crédito = 0 (variável)
- B26: Tarifa calculada = `=F38` (referência ao M³ médio calculado)

---

## 4. Modalidades de Cobrança — Lógica Completa

### 4.1 Resumo das 5 Planilhas Analisadas

| Condomínio | Modalidade | Concessionária | Tarifa | Rateio Área Comum |
|-----------|-----------|----------------|--------|-------------------|
| América Clube | MÍNIMO | Águas do Rio | R$6,564/m³ | Igual por unidade |
| Flamboyant | MÍNIMO | IGUÁ | R$6,0037/m³ | Igual por unidade |
| Bosque Araguaia | PROGRESSIVIDADE | IGUÁ | 2 faixas | **Fração Ideal** por unidade |
| Diamantina | REAL CONSUMO | SABESP | 4 faixas | Igual (coluna R = 0 neste mês) |
| Itatiaia | M³ MÉDIO | Sabesp | Calculado | Igual (coluna K = 0 neste mês) |

### 4.2 Regras das 4 Modalidades

---

#### MODALIDADE 1: MÍNIMO
```
Fórmula de cada unidade (coluna I = Valor Água):
  = ArrayFormula baseada em: MAX(consumo, mínimo) × tarifa_m3
  Onde mínimo = configurável por condomínio (geralmente 15 m³)

Esgoto (coluna J):
  = Valor Água (100%)

Área Comum (coluna L):
  = B18 / F2   ← (custo total área comum ÷ qtd unidades = igual para todos)

Total Unidade (coluna M):
  = Água + Esgoto + Área Comum

Mínimo se consumo = 0:
  CONFIGURÁVEL POR CONDOMÍNIO — pode cobrar ou não cobrar mínimo
```

---

#### MODALIDADE 2: PROGRESSIVIDADE
```
Colunas adicionais no MEDIÇÃO:
  I = Água+Esgoto calculado por faixas progressivas
  J = mesmo que I
  K = I + J (total água+esgoto)
  
  L = Encontro de Contas (custo área comum por fração ideal):
      = (B18 × fração_ideal_da_unidade) - desconto_fixo
      Onde B18 = custo área comum total (=F7 - B16 - B17 - F12)
      E fração_ideal = valor único por unidade (0,0058 ~ 0,0171, soma total = 1,0000)
      E desconto_fixo = 7,008 (ou variável por unidade via "encontro de contas")
  
  M = parcelamento fixo por unidade (ex: 16ª de 24 parcelas)
  N = K + L + M (total final)

Área Comum — FRAÇÃO IDEAL:
  Cada unidade tem um índice decimal cadastrado (ex: 0,0087)
  A soma de todas as frações = 1,0000 (100%)
  Custo da unidade = custo_total_área_comum × fração_ideal
  
  Unidades maiores têm fração maior → pagam mais área comum
  Unidades menores têm fração menor → pagam menos área comum

Mínimo se consumo = 0:
  CONFIGURÁVEL POR CONDOMÍNIO
```

---

#### MODALIDADE 3: REAL CONSUMO (SABESP)
```
Colunas MEDIÇÃO (Diamantina):
  I = volume até 10 m³ = IF(G>10, 10, G)
  J = volume de 11 a 20 m³ = ArrayFormula
  K = volume de 21 a 50 m³ = ArrayFormula
  L = volume acima de 50 m³ = IF(G>50, G-50, 0)
  
  M = I × tarifa_faixa1 (10 × R$8,08 = R$80,80)
  N = J × tarifa_faixa2 (até 10 × R$12,80)
  O = K × tarifa_faixa3 (até 30 × R$31,90)
  P = L × tarifa_faixa4 (excedente × R$35,14)
  
  Q = SUM(M:P) = subtotal por unidade
  R = Área Comum (0 neste condomínio — embutido na conta)
  S = R + Q = total final

Esgoto:
  Embutido nas tarifas (×2 = água+esgoto juntos) — CONFIGURÁVEL
  O "×2" significa que a tarifa já inclui água e esgoto

Mínimo se consumo = 0:
  CONFIGURÁVEL POR CONDOMÍNIO (Diamantina não aplica mínimo)
```

---

#### MODALIDADE 4: M³ MÉDIO
```
Tarifa calculada = Conta Total ÷ Consumo Real m³ ÷ 2
  (dividido por 2 porque inclui esgoto = 100% sobre água)

Fórmula (Itatiaia):
  Tarifa = F38 = F7/B13/2
  Onde F7 = conta total, B13 = consumo das unidades

Cada unidade paga:
  H = ArrayFormula (volume × tarifa calculada)
  I = H (esgoto = água)
  J = H + I (total água+esgoto)
  K = Área comum (0 neste caso)
  L = K + H + I (total final)

Itens adicionais na conta (configuráveis):
  F11 = Recursos hídricos (fixo)
  F12 = Multa/juros (variável)
  F13 = Taxa do lixo (fixo)
  F17 = Crédito (variável, subtrai)

Conta total = SUM(F11:F15) - crédito
```

---

### 4.3 Opções de Rateio de Área Comum (Configurável por Condomínio)

| Tipo de Rateio | Fórmula | Exemplo |
|---------------|---------|---------|
| **Igual para todos** | `custo_area / qtd_unidades` | América Clube, Flamboyant |
| **Fração Ideal** | `custo_area × fração_ideal_unidade` | Bosque Araguaia |
| **Proporcional ao consumo** | `custo_area × (consumo_unidade / consumo_total)` | Futuro |
| **Embutido na conta** | Não é rateado separado | Diamantina, Itatiaia |
| **Zero** | R$0,00 | Quando condomínio não rateia |

### 4.4 Regra do Mínimo (Configurável por Condomínio)

| Config | Comportamento |
|--------|--------------|
| Aplica mínimo, inclusive para zero | Unidade com consumo 0 paga o mínimo |
| Aplica mínimo, exceto para zero | Unidade com consumo 0 paga R$0; consumo <15m³ paga 15m³ |
| Não aplica mínimo | Sempre cobra o consumo real |

---

## 5. Upload de Planilha → Parser de Modelo

### 5.1 Fluxo de Cadastro de Novo Modelo

```
1. Analista acessa "Modelos de Cobrança" → "Novo Modelo"
2. Preenche: Nome, Concessionária, Modalidade base (dropdown)
3. Faz upload da planilha Excel com fórmulas preservadas
4. Sistema processa:
   a. Detecta células amarelas da aba INFORMAÇÕES
   b. Extrai fórmulas das colunas I, J, K, L, M (ou equivalentes)
   c. Identifica referências a INFORMAÇÕES!$B$26, $B$27, etc. (tarifas)
   d. Detecta se há coluna Fração Ideal
   e. Detecta faixas de consumo (IF(G>10, 10, G) etc.)
   f. Gera "prévia do modelo" em linguagem humana
5. Sistema exibe prévia:
   ┌─────────────────────────────────────────────┐
   │  MODELO DETECTADO: "SABESP Real Consumo"   │
   │                                              │
   │  Modalidade: REAL CONSUMO (4 faixas)        │
   │  Tarifas detectadas:                         │
   │    0–10 m³: R$ 8,08/m³ (×2 água+esgoto)    │
   │    11–20 m³: R$ 12,80/m³                    │
   │    21–50 m³: R$ 31,90/m³                    │
   │    > 50 m³: R$ 35,14/m³                     │
   │  Esgoto: embutido na tarifa (×2)            │
   │  Mínimo: não aplicado                        │
   │  Área comum: embutida na conta              │
   │  Campos amarelos (entrada por mês): 13      │
   │                                              │
   │  [✅ Validar e Salvar]  [✏️ Editar]          │
   └─────────────────────────────────────────────┘
6. Analista valida ou ajusta parâmetros
7. Modelo salvo e disponível para seleção
```

### 5.2 Campos que o Sistema Detecta Automaticamente

| Elemento | Como detecta | Confiança |
|----------|-------------|-----------|
| Células amarelas | Cor de fundo RGB:FFFFFF00 | Alta |
| Tarifas | Referências a B26, B27... em amarelo | Alta |
| Faixas de consumo | `IF(G>10,10,G)`, `IF(G>50,G-50,0)` | Alta |
| Fração ideal | Coluna com header "Fração Ideal" | Alta |
| Modalidade | Valor de F9 (célula amarela) | Alta |
| Mínimo | `MAX(consumo, 15)` nas fórmulas | Média |
| Custos extras | Linhas F11:F15 com rótulos | Média |
| Fórmulas ArrayFormula | `<ArrayFormula>` no openpyxl | Requer validação |

---

## 6. Módulos do Sistema

### 6.1 MÓDULO: Cadastro de Condomínios (Analista + Admin)

**Seção Dados Básicos:**
- Nome, CNPJ/CPF, endereço completo
- Concessionária (texto livre)
- Foto do condomínio

**Seção Contatos:**
- **Síndico**: nome, telefone, e-mails (campo múltiplo)
- **Administradora**: nome, CNPJ, responsável, e-mails (campo múltiplo)
- **E-mails cobrança**: lista de e-mails que recebem planilha + PDFs
- **E-mails alerta**: lista para notificações urgentes

**Seção Configuração de Cobrança:**
- Modelo de cobrança padrão (vínculo com módulo modelos)
- Mínimo de consumo: aplica? / exceção para consumo zero?
- Tipo de rateio área comum: Igual / Fração Ideal / Proporcional / Embutido / Zero
- Se Fração Ideal: campo para upload de tabela com frações por unidade

**Regras:**
- Analista cria e edita (incluindo todos os campos)
- Síndico visualiza apenas seu condomínio
- Histórico de alterações registrado
- Não é possível excluir condomínio com planilhas históricas

---

### 6.2 MÓDULO: Modelos de Cobrança

**Estrutura do modelo (banco de dados):**
```
BillingModel:
├── id, nome, concessionaria, modalidade
├── ativo: boolean
│
├── ÁGUA:
│   ├── tipo: UNICA | FAIXAS | CALCULADA
│   ├── faixas[]: { de_m3, ate_m3, valor_por_m3, inclui_esgoto: bool }
│   └── formula_calculo: "conta_total / consumo_real / 2"
│
├── ESGOTO:
│   ├── tipo: PERCENTUAL | EMBUTIDO | ZERO
│   └── percentual: 0–200%
│
├── MÍNIMO:
│   ├── aplicar: boolean
│   ├── m3_minimo: float (ex: 15)
│   └── excecao_consumo_zero: boolean
│       (true = consumo 0 paga 0; false = consumo 0 paga mínimo)
│
├── ÁREA COMUM:
│   ├── tipo: IGUAL | FRACAO_IDEAL | PROPORCIONAL | EMBUTIDO | ZERO
│   └── formula: "(conta_total - soma_unidades) / qtd_unidades"
│
└── CUSTOS EXTRAS (configuráveis, podem ter 0 ou N itens):
    ├── nome, tipo: FIXO | VARIAVEL | CALCULADO
    ├── valor_padrao (para fixos)
    └── formula (para calculados)
```

**Campos amarelos = campos de entrada por mês:**
- O sistema guarda quais células/campos são variáveis por mês
- Ao criar planilha do mês, apresenta apenas esses campos para o analista preencher
- Ex: Itatiaia tem 7 campos variáveis; América Clube tem 5 campos

---

### 6.3 MÓDULO: Rota de Leitura + Ordem de Serviço

#### Criação da Rota (Admin ou Analista)
1. Selecionar condomínio
2. Selecionar leiturista responsável
3. Definir data programada
4. Sistema lista todas as unidades/medidores cadastrados
5. Ordenar rota (drag-and-drop por localização)
6. **Gerar Ordem de Serviço automaticamente**
7. Enviar notificação por e-mail ao condomínio: "Leitura agendada para DD/MM"

#### Ordem de Serviço (OS)
```
OS contém:
├── Número: OS-AAAA-NNNN (sequencial)
├── Condomínio: nome + endereço
├── Leiturista responsável
├── Data programada / Data realizada
├── Período de referência (mês/ano)
├── Lista completa de unidades com status
├── Resumo: total | lidas | pendentes | alertas OCR
│
└── ASSINATURAS (2 opções disponíveis):
    ├── Opção A – Presencial: tablet/celular do leiturista
    │   → Leiturista assina → Síndico/porteiro assina no mesmo dispositivo
    └── Opção B – Remota: link enviado por e-mail
        → Sistema envia link ao síndico → síndico assina pelo browser
        → Ambas notificam Admin/Analista ao concluir
```

**Status da OS:** GERADA → EM_EXECUCAO → FINALIZADA → ASSINADA

**Visibilidade:**
- Admin: visualizar + gerar
- Analista: visualizar (somente leitura após assinatura)
- Leiturista: visualizar + assinar
- Síndico: visualizar (somente leitura)
- OS assinada: **imutável para todos**

---

### 6.4 MÓDULO: App Leiturista (Mobile-First)

#### Fluxo do Leiturista
```
1. Login → Dashboard: "Você tem X rotas hoje"
2. Selecionar rota/condomínio
3. Ver lista de unidades em ordem de rota
4. Para cada unidade:
   a. Tap → câmera abre automaticamente
   b. Tirar foto do hidrômetro
   c. Foto sobe para Cloudflare R2
   d. OCR processa (Tesseract + fallback Google Vision)
   e. Resultado retorna em < 5 segundos:
      ┌──────────────────────────────┐
      │ Leitura detectada: 2.084,58  │
      │ Confiança: 97% ✅            │
      │ [✅ Confirmar] [✏️ Corrigir] │
      └──────────────────────────────┘
   f. SE confiança < 70%:
      ┌──────────────────────────────┐
      │ ⚠️ Foto pouco legível         │
      │ Digite a leitura manualmente: │
      │ [____________________]        │
      │ [✅ Confirmar] [📷 Refazer]   │
      └──────────────────────────────┘
   g. Confirmar → próxima unidade
5. Ao finalizar: "Rota Concluída" → OS aparece
6. Leiturista assina digitalmente
7. Opção: síndico assina no mesmo dispositivo (presencial)
8. OS enviada → notificação para Admin/Analista
```

#### Alertas OCR
| Cor | Confiança | Ação |
|-----|-----------|------|
| 🟢 Verde | ≥ 95% | Confirmar automaticamente ou com 1 tap |
| 🟡 Amarelo | 70–94% | Revisar valor sugerido |
| 🔴 Vermelho | < 70% | Inserção manual obrigatória |

**Flag "Revisão Manual"**: toda leitura com confiança < 95% fica marcada para revisão pelo Analista.

---

### 6.5 MÓDULO: Planilha do Mês (Analista)

#### Campos de Entrada (baseados nas células amarelas)
Ao criar uma planilha mensal, o sistema apresenta **apenas os campos amarelos** do modelo selecionado:

**Campos comuns:**
- Mês de referência
- Data de leitura atual
- Data leitura anterior
- Data leitura prevista
- Concessionária (auto-preenchido, editável)
- Consumo real m³ (da fatura)
- Recursos hídricos (valor fixo da fatura)
- Multas/juros (se houver)
- Valor água (da fatura)
- Valor esgoto (da fatura — geralmente auto = valor água)
- Vencimento da conta ← **OBRIGATÓRIO PARA FECHAR**

**Campos extras por modalidade:**
- MÍNIMO: tarifa m³
- REAL CONSUMO: 4 tarifas por faixa
- PROGRESSIVIDADE: 2 tarifas + desconto por unidade
- M³ MÉDIO: taxa lixo + multa + crédito

#### Estrutura da Planilha Digital

```
PANORAMA (topo — calculado automaticamente):
├── Condomínio + Concessionária + Período
├── Modalidade de cobrança (selecionável)
├── Consumo total concessionária m³
├── Consumo unidades m³ + Consumo área comum m³
├── Conta total R$ (calculada)
├── Média por unidade R$
├── Dias de consumo
├── Qtd unidades + Unidades sem consumo
├── Unidades com aumento > 25% (alerta)
└── Unidades acima do mínimo

TABELA DE UNIDADES:
Col A: Unidade | Col B: Bloco
Col C: Leitura Anterior | Col D: Leitura Atual
Col E: Vol. mês anterior | Col F: Vol. consumido
Col G: % comparativa ← DIFERENÇA EM RELAÇÃO AO MÊS ANTERIOR
Col H: Valor Água | Col I: Valor Esgoto
Col J: Subtotal | Col K: Área Comum | Col L: Total
[Foto] [Status: ✅/⚠️/🔴]

TOTAIS (rodapé)
CAMPOS DE FECHAMENTO (amarelos):
└── Valor da Conta ← BLOQUEIO: planilha não fecha sem este campo
```

#### Regra de Fechamento
```
BLOQUEADO até que:
  ✅ Valor da conta preenchido (campo não pode ser 0 ou vazio)
  ✅ Todas as unidades com leitura (ou justificativa)
  ✅ Leituras "Revisão Manual" todas revisadas pelo Analista
  ✅ Analista clica "Fechar e Processar"

APÓS FECHAR (automaticamente):
  → Recalcula consumos finais com valores da conta
  → Gera 3 PDFs (Dashboard, Média Anual, Relatório Faixas)
  → Gera XLSX para download
  → Envia e-mail (XLSX + 3 PDFs) para condomínio via Zoho ZeptoMail
  → Registra envio com log imutável
  → Sincroniza leituras com AcquaXControl
  → Dispara alertas para unidades com aumento > 25%
```

#### Alertas de Aumento Significativo
- Threshold configurável por condomínio (padrão: 25%)
- E-mail enviado para síndico + administradora com:
  - Unidade e bloco, consumo anterior vs atual, % de aumento
  - **Foto do hidrômetro** anexada
  - Link direto para a planilha

---

### 6.6 MÓDULO: PDFs Automáticos (3 documentos)

#### PDF 1: Dashboard do Mês
Baseado no `Dashboard.pdf` analisado:
- KPIs: consumo total, conta, unidades s/consumo, aumento >25%, acima do mínimo
- Gráfico: evolução mensal 12 meses
- Gráfico: consumo diário médio (atual vs anterior vs média)
- Gráfico: distribuição por faixas de consumo
- Tabela: Top consumidores

#### PDF 2: Média Anual por Unidade
Baseado no `Média anual.pdf` analisado:
- Tabela: Unidade × 12 meses de consumo m³
- Média anual por unidade
- Destaque: irregular (>2x a média)

#### PDF 3: Relatório por Faixas de Consumo
Baseado no `Relatório.pdf` analisado:
- Faixas configuráveis (padrão baseado na aba INFORMAÇÕES):
  `0 | 0,01–15 | 15,01–20 | 20,01–30 | 30,01–40 | 40,01–50 | 50,01–60 | 60,01–70 | 70,01–80 | >80`
- Count e % por faixa
- Comparativo mês anterior

**Todos os PDFs:**
- Gerados automaticamente ao fechar
- Download individual ou em ZIP (planilha + 3 PDFs)
- Arquivados historicamente

---

### 6.7 MÓDULO: Envio Automático de E-mails

| Trigger | Destinatário | Conteúdo | Log |
|---------|-------------|----------|-----|
| Rota agendada | Condomínio | "Leitura agendada DD/MM" | Sim |
| Planilha fechada | Condomínio + Admin | XLSX + 3 PDFs | **Obrigatório** |
| Aumento > 25% | Síndico + Admin | Alerta + foto | Sim |
| OS assinada | Admin + Analista | Confirmação | Sim |
| Conta não lançada (24h) | Analista | Lembrete interno | Não |

**Log de envio (imutável):**
```
EmailLog: id | tipo | destinatários[] | assunto | anexos[]
          status | enviadoEm | erro | criadoPor
```

---

### 6.8 MÓDULO: Templates de Documentos
```
Template: id | nome | tipo (EMAIL|PDF|OS|NOTIFICACAO)
          variáveis disponíveis | conteúdo HTML/Markdown
          ativo | versões históricas
```
Variáveis padrão: `{{condominio}}`, `{{mes}}`, `{{conta_total}}`, `{{leiturista}}`, `{{unidades_alerta}}`, etc.

---

### 6.9 MÓDULO: Integração AcquaXControl
```
Field → AcquaXControl (ao fechar planilha):
  POST /api/readings → leituras do mês
  POST /api/apartment-reports → relatórios por unidade
  Fotos: URL do Cloudflare R2 (compartilhadas)

AcquaXControl → Field:
  GET /api/apartments → unidades/medidores cadastrados
  GET /api/readings/latest → última leitura armazenada

VERIFICAÇÃO DE SEGURANÇA (AcquaXControl):
  Quando foto é enviada ao AcquaXControl:
  → OCR da foto vs leitura armazenada
  → Divergência > 5%: alerta amarelo
  → Divergência > 15%: alerta vermelho + bloquear
  → Admin deve confirmar manualmente
```

---

## 7. Arquitetura Técnica

### 7.1 Diagrama de Fluxo
```
LEITURISTA          ANALISTA            SISTEMA
    │                   │                   │
    │ Foto hidrômetro   │                   │
    ├──────────────────────────────────────>│
    │                   │    OCR processa   │
    │<─────────────────────────────────────┤
    │ Confirma leitura  │                   │
    ├──────────────────────────────────────>│
    │                   │                   │
    │ Finaliza rota     │                   │
    ├──────────────────────────────────────>│ Notifica analista
    │                   │<──────────────────┤
    │                   │ Abre planilha     │
    │                   ├──────────────────>│ Carrega leituras
    │                   │                   │
    │                   │ Revisa OCR alerts │
    │                   ├──────────────────>│
    │                   │ Lança conta (R$)  │
    │                   ├──────────────────>│
    │                   │ Aprova fechamento │
    │                   ├──────────────────>│
    │                   │                   │ Calcula consumos
    │                   │                   │ Gera 3 PDFs
    │                   │                   │ Envia e-mail + log
    │                   │                   │ Sync AcquaXControl
    │                   │<──────────────────┤ "Planilha Finalizada"
```

### 7.2 Novos Modelos no Banco de Dados
```
BillingModel         ← modelo de cobrança cadastrável
ComplexBillingConfig ← configuração mensal por condomínio
ServiceOrder         ← ordem de serviço com assinaturas
EmailLog             ← log imutável de envios
DocumentTemplate     ← templates de e-mail/PDF/OS
```

### 7.3 OCR Pipeline
```
1. Foto → upload Cloudflare R2 (URL permanente)
2. Worker DigitalOcean → Tesseract 4.x
3. SE confiança < 85% → Google Vision API (fallback)
4. Retorna: { reading, confidence, method, processingTime }
5. Reading.isManualReading = (confidence < 0.95)
6. Custo: Tesseract R$0 + Google Vision ~R$22/mês (5% fallback)
```

---

## 8. Custo Total do Projeto

### 8.1 Infraestrutura Mensal

| Serviço | Detalhes | Custo/mês |
|---------|---------|-----------|
| Vercel Pro | Deploy ambos sistemas | ~R$115 |
| MongoDB Atlas M10 | 50k fotos + IoT + múltiplos condos | ~R$270 |
| Cloudflare R2 | 50k × 400KB = 20GB/mês armazenamento | ~R$28 |
| DigitalOcean 2GB | MQTT + Tesseract OCR worker | ~R$68 |
| Zoho ZeptoMail | ~50k e-mails notificações | ~R$50 |
| Google Vision | Fallback OCR 5% = ~2.500 imgs | ~R$22 |
| OneSignal Push | Notificações push Web/Android | R$0 |
| Sentry + UptimeRobot | Monitoramento erros + uptime | R$0 |
| **TOTAL** | | **~R$553/mês** |

### 8.2 Custos Únicos

| Item | Custo |
|------|-------|
| Google Play Developer (taxa única) | ~R$145 (US$25) |
| Apple Developer Program (anual) | ~R$570/ano (US$99) |
| **Total publicação lojas** | **~R$715 (1º ano)** |

### 8.3 Custo de Desenvolvimento (Genspark)

| Módulo | Horas estimadas | Complexidade |
|--------|----------------|-------------|
| Setup projeto + auth + perfis | 20h | Baixa |
| Cadastro condomínios (múltiplos e-mails + fração ideal) | 20h | Média |
| Engine de cálculo (4 modalidades + mínimo + rateio) | 48h | **Alta** |
| Upload planilha + parser de modelo | 24h | **Alta** |
| CRUD modelos de cobrança (UI) | 20h | Média |
| Rota de leitura + drag-and-drop | 20h | Média |
| Ordem de Serviço + assinatura digital (dupla) | 24h | Média |
| App Leiturista mobile-first + câmera | 32h | **Alta** |
| Integração OCR (Tesseract + fallback Google Vision) | 24h | **Alta** |
| Planilha digital do mês (panorama + tabela) | 32h | **Alta** |
| Regra de fechamento + validação | 8h | Baixa |
| Geração PDF Dashboard | 16h | Média |
| Geração PDF Média Anual | 16h | Média |
| Geração PDF Relatório Faixas | 12h | Média |
| Download ZIP (XLSX + 3 PDFs) | 6h | Baixa |
| Envio e-mail automático com log (Zoho) | 16h | Média |
| Alerta aumento > 25% com foto anexada | 12h | Média |
| Templates de documentos | 12h | Média |
| Integração AcquaXControl (API sync) | 24h | Média |
| Verificação segurança foto vs leitura | 12h | Média |
| PWA + service worker + lojas | 10h | Baixa |
| Testes, ajustes e documentação | 24h | — |
| **TOTAL** | **~432h** | |

**Estimativa de créditos Genspark:**
- Mínimo: ~120.000 créditos = US$240 ≈ **R$1.380**
- Máximo: ~180.000 créditos = US$360 ≈ **R$2.070**
- **Média estimada: ~150.000 créditos ≈ R$1.725**

### 8.4 Custo Total Consolidado

| Categoria | Valor |
|-----------|-------|
| Desenvolvimento Genspark (estimativa média) | ~R$1.725 |
| Publicação nas lojas (1º ano) | R$715 |
| Infraestrutura mês 1 | R$553 |
| **TOTAL PARA LANÇAR** | **~R$2.993** |
| Custo mensal recorrente (infra) | ~R$553/mês |
| Renovação Apple Store (a partir do ano 2) | R$570/ano |
| **CUSTO ANO 1 TOTAL** | **~R$9.349** |
| **CUSTO MENSAL MÉDIO ANO 1** | **~R$779/mês** |

---

## 9. Roadmap de Implementação (14 semanas)

### Fase 1 — Fundação (Semanas 1–3)
- Setup projeto AcquaX Field (Next.js 15, MongoDB, auth, PWA)
- 5 perfis de usuário + permissões
- Cadastro de condomínios (múltiplos e-mails + fração ideal)
- CRUD de modelos de cobrança (4 modalidades)
- Engine de cálculo de consumo

### Fase 2 — Campo (Semanas 4–6)
- Rota de leitura + drag-and-drop
- Ordem de Serviço + assinatura digital (presencial + remota)
- App leiturista mobile-first
- Integração OCR (Tesseract + Google Vision)
- Alertas de confiança OCR

### Fase 3 — Parser de Modelos (Semanas 5–7)
- Upload de planilha Excel com fórmulas
- Parser automático: células amarelas → campos de entrada
- Detecção de tarifas, faixas, fração ideal
- Tela de prévia e validação pelo analista
- Testes com os 5 modelos já analisados

### Fase 4 — Planilha e PDFs (Semanas 8–11)
- Planilha digital do mês (panorama + tabela + comparativos)
- Campos de fechamento + bloqueio obrigatório
- Cálculo final com modelos configurados
- Geração dos 3 PDFs automáticos
- Download ZIP

### Fase 5 — Notificações e Integrações (Semanas 11–13)
- Envio automático via Zoho ZeptoMail com log
- Alerta de aumento > 25% com foto
- Templates de documentos
- Integração API AcquaXControl
- Verificação segurança foto vs leitura

### Fase 6 — Publicação (Semana 14)
- Testes finais (mobile iOS + Android)
- PWABuilder → Google Play
- PWABuilder → Apple App Store
- Documentação e treinamento

---

## 10. Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| OCR impreciso em hidrômetros antigos/danificados | Média | Alto | Alerta obrigatório, inserção manual, refazer foto |
| 18+ modelos com fórmulas fora do padrão detectável | Alta | Médio | Engine flexível + campo "fórmula custom" + fallback manual |
| iOS restringe câmera em PWA | Baixa | Alto | Testar iOS 16.4+ / PWABuilder wrapper nativo |
| 50k fotos em MongoDB (se base64) | Alta | Alto | **Migrar para Cloudflare R2 imediatamente** |
| ArrayFormulas não lidas corretamente | Alta | Médio | Requer validação manual pelo analista após upload |
| Planilha enviada com valores incorretos | Média | Alto | Dupla confirmação + log imutável + histórico |

---

*Documento v2.0 — Março 2026*
*Baseado na análise de 5 planilhas reais com fórmulas, células amarelas mapeadas, e nas respostas às perguntas de validação.*
*AcquaX Field — Sistema paralelo e interoperável com AcquaXControl*
