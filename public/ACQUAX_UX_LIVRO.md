# AcquaX Control
## Livro de Experiência do Usuário (UX)
### Guia Completo de Uso, Design e Melhoria Contínua

**Versão 1.0 — Março 2026**
*Documento vivo — atualizar conforme o sistema evolui*

---

# PREFÁCIO

Este livro foi escrito para qualquer pessoa que precise operar, entender ou melhorar o AcquaX Control — seja o técnico de TI que vai configurar o sistema, o administrador que vai gerenciar os condomínios, o síndico que vai acompanhar os dados, ou o morador que vai consultar sua fatura.

A ideia é simples: **quem lê este livro consegue usar o sistema sem precisar perguntar nada a ninguém.**

Mais do que um manual, este documento é um registro de decisões de design — por que cada tela foi feita do jeito que foi, o que funciona bem, o que pode melhorar, e como o sistema deve evoluir com base no que os usuários realmente precisam.

---

# PARTE 1 — ENTENDENDO O SISTEMA

## Capítulo 1 — O que é o AcquaX Control?

O AcquaX Control é um sistema de gestão de consumo de água para condomínios. Ele conecta três pontos:

```
[Medidor físico instalado no apartamento]
          ↓ envia leitura via IoT
[Sistema AcquaX] ← processa, calcula, exibe
          ↓ gera relatório
[Morador recebe a filipeta com sua fatura]
```

**O que o sistema faz na prática:**

1. **Registra leituras** dos hidrômetros — manualmente por leituristas ou automaticamente via dispositivos IoT
2. **Calcula o consumo** de cada unidade com base nas leituras anterior e atual
3. **Apura os valores** — água/esgoto individual + rateio de área comum
4. **Gera a filipeta** — o documento que vai para o morador com foto do medidor e valor a pagar
5. **Monitora em tempo real** — nível de caixas d'água e alertas de consumo anormal

---

## Capítulo 2 — Os 5 Perfis de Usuário

O sistema tem 5 tipos de usuário, cada um com uma visão diferente.

---

### 👨‍💻 PERFIL 1 — PROGRAMADOR
**Quem é:** A equipe técnica da AcquaX que configura e mantém o sistema.

**O que vê ao entrar:**
- Atalhos rápidos para cadastrar condomínios, blocos, apartamentos e medidores
- Acesso a TUDO no sistema, sem restrições

**Responsabilidades principais:**
- Cadastrar novos clientes (empresa → condomínio → bloco → apartamento → medidor)
- Configurar dispositivos IoT e vincular aos medidores
- Gerenciar usuários e permissões
- Configurar tipos de tarifa (filipeta)

**Cor de identificação no sistema:** Cinza técnico — neutro, profissional

---

### 👔 PERFIL 2 — ADMINISTRADOR
**Quem é:** Gestor interno da AcquaX. Visão estratégica de toda a operação.

**O que vê ao entrar:**
- Painel KPI com todos os condomínios: leituras pendentes, alertas, consumo total
- Resumo financeiro da operação

**Responsabilidades principais:**
- Supervisionar a operação de todos os condomínios
- Acompanhar indicadores de performance
- Aprovar configurações de tarifa

**Cor de identificação:** Azul corporativo — confiança, gestão

---

### 🏢 PERFIL 3 — ADMINISTRADORA
**Quem é:** A empresa administradora do condomínio (ex: imobiliária, administradora de condomínios).

**O que vê ao entrar:**
- Lista dos condomínios que gerencia
- Dados de consumo e faturamento dos seus condomínios
- Sem acesso a outros condomínios

**Responsabilidades principais:**
- Acompanhar o consumo dos condomínios da carteira
- Baixar relatórios e filipetas para enviar aos moradores
- Acionar a AcquaX quando necessário

**Cor de identificação:** Verde — parceria, negócio

---

### 🔑 PERFIL 4 — SÍNDICO
**Quem é:** O síndico do condomínio.

**O que vê ao entrar:**
- Painel exclusivo do seu condomínio
- Consumo por bloco e por unidade
- Alertas de consumo fora do padrão

**Responsabilidades principais:**
- Acompanhar o consumo do condomínio
- Verificar unidades com consumo anormal
- Consultar histórico de leituras

**Cor de identificação:** Teal/Verde-água — transparência, água

---

### 🏠 PERFIL 5 — MORADOR
**Quem é:** O morador da unidade.

**O que vê ao entrar:**
- Consumo anual da sua unidade (gráfico)
- Fatura do mês atual
- Histórico dos últimos meses

**Responsabilidades principais:**
- Consultar o próprio consumo
- Ver a filipeta (fatura) do mês
- Acompanhar histórico no levantamento

**Cor de identificação:** Azul claro — residencial, pessoal

---

## Capítulo 3 — A Arquitetura de Informação

Como o sistema está organizado hierarquicamente:

```
EMPRESA (ex: AcquaX Brasil Ltda.)
└── CONDOMÍNIO (ex: Residencial Diamantina)
    └── BLOCO (ex: Bloco A)
        └── APARTAMENTO (ex: Apt 101)
            └── MEDIDOR (ex: Chassi B24A0019474D)
                └── LEITURAS (ex: 457,862 m³ em 01/03/2026)
                    └── FILIPETA (documento gerado ao final do mês)
```

**Por que essa hierarquia importa para o UX:**
Toda tela do sistema respeita essa hierarquia. Quando o usuário está numa tela de apartamento, ele sempre sabe em qual bloco e condomínio está. Isso evita o erro mais comum em sistemas assim: o usuário se perder e cadastrar dados no lugar errado.

---

# PARTE 2 — GUIA DE CADA TELA

## Capítulo 4 — Tela Inicial (Dashboard)

### O que é
A primeira tela que o usuário vê após o login. **Muda completamente dependendo do perfil.**

---

### Dashboard do Morador
**Objetivo:** O morador entrar, ver em 5 segundos quanto consumiu e quanto vai pagar.

**O que aparece:**
- Gráfico de barras com consumo dos últimos 12 meses (m³)
- Card destacado com o mês atual: consumo + valor estimado
- Botão direto para a filipeta

**Princípio de design aplicado:** *"Zero cliques para a informação principal"* — o morador não precisa navegar, a resposta está na tela inicial.

**⚠️ Problema identificado / Oportunidade de melhoria:**
Moradores que nunca usaram sistema web não sabem o que é m³. Sugestão futura: traduzir para linguagem cotidiana — *"Você consumiu o equivalente a 13 banhos de 15 minutos a mais que o mês passado."*

---

### Dashboard do Síndico / Administradora
**Objetivo:** Visão panorâmica do condomínio — o que está normal, o que precisa de atenção.

**O que aparece:**
- Cards KPI: total de unidades, leituras do mês, consumo total, variação vs. mês anterior
- Lista de unidades com consumo fora do padrão (alertas)
- Gráfico de evolução do condomínio

---

### Dashboard do Administrador
**Objetivo:** Gestão da operação completa — todos os condomínios de uma vez.

**O que aparece:**
- KPIs consolidados: quantos condomínios, quantas leituras pendentes, alertas
- Visão por condomínio: % de leituras concluídas no mês
- Mapa de calor de consumo (quando disponível)

---

### Dashboard do Programador
**Objetivo:** Acesso rápido aos cadastros — o programador não gerencia, ele configura.

**O que aparece:**
- Atalhos rápidos: "Novo Condomínio", "Novo Bloco", "Novo Apartamento", "Novo Medidor"
- Últimas atividades do sistema
- Alertas técnicos (dispositivos offline, erros de importação)

---

## Capítulo 5 — Filipeta (Meter Report)

### O que é
O documento mais importante do sistema. É o que vai para o morador — equivalente à conta de água, mas individual por apartamento.

### Elementos da filipeta (em ordem de importância visual):

```
┌─────────────────────────────────────┐
│  LOGO DA EMPRESA / CONDOMÍNIO       │
├─────────────────────────────────────┤
│  📷 FOTO DO MEDIDOR                 │  ← MAIS IMPORTANTE
│  (mostra o mostrador com a leitura) │
├─────────────────────────────────────┤
│  Leitura Anterior: 00444,194 m³     │
│  Leitura Atual:    00457,862 m³     │
│  Consumo:          13,668 m³        │
├─────────────────────────────────────┤
│  Água/Esgoto:      R$ 87,50         │
│  Área Comum:       R$ 12,30         │
│  ─────────────────────────────      │
│  TOTAL A PAGAR:    R$ 99,80         │
├─────────────────────────────────────┤
│  Histórico (mini gráfico 6 meses)   │
└─────────────────────────────────────┘
```

### Por que a foto do medidor é a parte mais importante

**A foto serve como prova.** Se o morador questionar o valor, a foto do mostrador com a numeração é a evidência visual de que a leitura está correta. Sem foto, é a palavra do leiturista contra a do morador.

**Decisão de design crítica:**
A foto usa `object-contain` (não `object-cover`). Isso significa que a foto é exibida inteira, sem corte. O motivo: cada leiturista tira a foto de um ângulo diferente. Se cortarmos, podemos cortar justamente os números do mostrador — o que é o único elemento que importa.

**⚠️ O que fazer na hora de tirar a foto do medidor:**
- Segurar o celular na horizontal, se possível
- Mostrador deve ocupar pelo menos 60% da foto
- Boa iluminação — sem reflexo no vidro do medidor
- Foco nos números — devem estar legíveis na foto

---

### Como imprimir a filipeta corretamente

1. Abrir a filipeta no sistema
2. Clicar em "Imprimir / Exportar"
3. No diálogo de impressão do navegador:
   - Selecionar "Salvar como PDF" para enviar por WhatsApp/email
   - Desmarcar "Cabeçalhos e rodapés" do navegador
   - Selecionar papel A4
4. A foto do medidor aparece na versão impressa (elemento nativo `<img>`, não é bloqueado pela impressora)

---

## Capítulo 6 — Levantamento

### O que é
Relatório comparativo de consumo por período. Permite ver vários meses lado a lado.

### Quem usa e como:

**Administrador / Síndico:**
- Seleciona o período (ex: Jan/2026 a Mar/2026)
- Seleciona o condomínio
- Vê uma tabela com todas as unidades × todos os meses
- Clica em qualquer unidade para expandir e ver: fotos, leituras, valores
- Identifica rapidamente unidades com consumo anormal (setas de tendência ↑↓)

**Morador:**
- Vê automaticamente apenas a sua unidade
- Cada mês aparece como um **card individual com foto grande do medidor**
- Não precisa expandir nada — a foto já aparece em destaque
- Pode imprimir o histórico completo

### Princípio de design: "Diferente para cada perfil"
Um administrador precisa de uma tabela densa para comparar 50 unidades de uma vez.
Um morador precisa de cards visuais para entender intuitivamente.
**A mesma página serve dois propósitos completamente diferentes** — e muda de formato automaticamente conforme o perfil logado.

---

## Capítulo 7 — Leituras

### O que é
Registro manual ou importação de leituras dos medidores.

### Fluxo de trabalho do leiturista:

```
1. Leiturista vai ao condomínio com celular
2. Abre o sistema → Leituras → Nova Leitura
3. Seleciona: Condomínio > Bloco > Apartamento > Medidor
4. Digita o valor do mostrador (ex: 00457,862)
5. Tira foto do medidor com o celular
6. Salva
7. Vai para o próximo apartamento
```

### Importação em lote (para condomínios grandes)
Em vez de entrar unidade por unidade:
1. Baixar o modelo de planilha Excel
2. Preencher todas as leituras offline
3. Fazer upload da planilha
4. Sistema valida e importa tudo de uma vez

### ⚠️ Erros comuns e como evitar:

| Erro | Causa | Como evitar |
|---|---|---|
| Leitura menor que a anterior | Digitou errado ou medidor trocado | Sistema alerta automaticamente |
| Medidor não encontrado | Chassi digitado errado | Usar câmera para escanear o código de barras do medidor |
| Foto não aparece na filipeta | Upload falhou | Aguardar barra de progresso completar antes de salvar |

---

## Capítulo 8 — Dispositivos IoT

### O que é
Gerenciamento dos sensores físicos instalados nos medidores que enviam leitura automaticamente.

### Como funciona na prática:

```
[Sensor IoT fixado no medidor]
        ↓ a cada X minutos envia via rádio
[Gateway GroupLink no condomínio]
        ↓ via internet
[Broker MQTT: mqtt.grouplinknetwork.com]
        ↓ AcquaX escuta e processa
[Banco de dados → aparece no sistema]
```

### Vinculação Dispositivo ↔ Medidor
O dispositivo IoT envia um ID chamado `remote_id` (ex: `B24A0019474D`). Esse ID precisa corresponder ao número de chassi do medidor cadastrado no sistema. **Se não estiver vinculado, a leitura chega mas é descartada.**

**Como vincular:**
1. Ir em: IOTs → Lista de Dispositivos
2. Encontrar o dispositivo pelo device_id
3. Clicar em "Vincular Medidor"
4. Selecionar o medidor pelo chassi correspondente
5. Definir data de início do vínculo

### Status possíveis de um dispositivo:
- 🟢 **Online** — enviou leitura nas últimas 2 horas
- 🟡 **Atenção** — última leitura há mais de 6 horas
- 🔴 **Offline** — última leitura há mais de 24 horas
- ⚫ **Sem vínculo** — recebendo dados mas não vinculado a nenhum medidor

---

## Capítulo 9 — Monitoramento de Reservatórios

### O que é
Acompanhamento em tempo real do nível das caixas d'água dos condomínios.

### Por que isso importa:
Um condomínio com 100 apartamentos pode ficar sem água se a caixa esvaziar durante a madrugada sem ninguém perceber. O sistema monitora e alerta automaticamente.

### Configuração de alertas:
- **Nível mínimo:** abaixo de X% → notificação imediata
- **Nível máximo:** acima de Y% → válvula cheia (evitar desperdício)
- **Canal Telegram:** cada reservatório tem um canal de notificações

### Leitura dos dados:
- **Nível (m):** altura da água em metros
- **Temperatura:** temperatura da água (detecta aquecimento anormal)
- **Bateria:** nível de bateria do sensor (alertar quando abaixo de 20%)

---

## Capítulo 10 — Contas de Concessionária

### O que é
Registro das contas mensais de água recebidas da CESAN, SABESP ou outra concessionária.

### Para que serve:
Quando a conta geral do condomínio chega, o gestor registra:
- Mês de referência
- Valor total
- Consumo total (m³)
- Tarifa

O sistema usa esses dados para calcular o **rateio** — quanto cada apartamento deve pagar proporcionalmente ao seu consumo individual.

### Fluxo do rateio:
```
Conta da concessionária: R$ 2.400,00 (480 m³ no total)
Apt 101 consumiu: 13,668 m³ (2,85% do total)
Valor do Apt 101: R$ 68,40 + rateio de área comum
```

---

# PARTE 3 — DESIGN E IDENTIDADE VISUAL

## Capítulo 11 — As Cores do Sistema e o que Significam

### Paleta Principal

| Cor | Código | Uso | Psicologia |
|---|---|---|---|
| **Teal (Verde-água)** | `#0d9488` | Cor principal, botões primários, cabeçalhos | Água, confiança, tecnologia limpa |
| **Azul** | `#3b82f6` | Informação, links, dados numéricos | Clareza, dados, confiabilidade |
| **Verde** | `#22c55e` | Sucesso, consumo normal, aprovado | Positivo, eficiência |
| **Vermelho** | `#ef4444` | Alertas críticos, consumo alto, erro | Atenção urgente |
| **Amarelo** | `#f59e0b` | Avisos moderados, atenção | Cuidado, observação |
| **Cinza claro** | `#f8fafc` | Fundos de cards, linhas alternas | Neutralidade, limpeza |
| **Cinza escuro** | `#1e293b` | Texto principal | Legibilidade |

### Por que Teal é a cor principal
Teal (verde-azulado) remete diretamente a **água limpa, tratada, de qualidade**. Não é o azul genérico de "tecnologia" nem o verde genérico de "sustentabilidade" — é a cor exata que a maioria das pessoas associa inconscientemente com água potável cristalina.

---

### Código de cores por status (universal em todo o sistema)

```
🟢 Verde    = Tudo certo, dentro do esperado
🔵 Azul     = Informação neutra, em andamento
🟡 Amarelo  = Atenção, verificar
🔴 Vermelho = Problema, ação necessária imediata
⚫ Cinza    = Inativo, sem dados, desconhecido
```

**Regra de ouro:** Nunca usar vermelho para informação decorativa. Vermelho = ação urgente necessária. Se o usuário ver vermelho e for só estética, ele vai deixar de prestar atenção quando for real.

---

### Hierarquia tipográfica

| Elemento | Tamanho | Peso | Uso |
|---|---|---|---|
| Título de página | 20-24px | Bold | `h1` de cada tela |
| Subtítulo de seção | 14-16px | Semibold | Headers de cards |
| Número KPI grande | 24-32px | Bold | Valores em destaque |
| Texto de tabela | 12-13px | Regular | Dados tabulares |
| Label / legenda | 10-11px | Medium, uppercase | Rótulos de campos |
| Texto de ajuda | 12px | Regular, cinza | Descrições secundárias |

---

## Capítulo 12 — Princípios de Design Aplicados

### Princípio 1: Informação progressiva
O usuário vê o resumo primeiro, detalhe depois. Exemplo: na tabela de levantamento, você vê o consumo mensal. Se quiser ver a foto, leituras e valores, clica para expandir. Nunca jogue toda a informação de uma vez.

### Princípio 2: Zero ambiguidade em números
Números de consumo sempre com unidade: **13,668 m³** — nunca apenas "13,668". Valores monetários sempre com símbolo: **R$ 99,80** — nunca "99.80".

### Princípio 3: Feedback imediato
Toda ação do usuário tem resposta visual:
- Clicou salvar → spinner de carregamento
- Salvou → toast verde "Salvo com sucesso"
- Deu erro → toast vermelho com mensagem clara
- Upload de foto → barra de progresso

### Princípio 4: Prevenção de erro > recuperação de erro
Melhor impedir o erro do que ter que desfazê-lo. Exemplos:
- Leitura menor que anterior → alerta antes de salvar
- Excluir registro → confirmação com nome do item
- Campo obrigatório vazio → destaque visual antes de submeter

### Princípio 5: Mobile first para moradores e síndicos
Moradores consultam pelo celular. Síndicos também. Todas as telas que eles acessam funcionam perfeitamente em tela de 375px. Tabelas densas (que só admins usam) podem ser apenas desktop.

---

## Capítulo 13 — Fluxos Críticos de Uso

### Fluxo 1 — Cadastrar um novo condomínio (do zero)

```
1. Empresa (se não existir) → Administradoras → Nova Empresa
2. Condomínio → Condomínios → Novo Condomínio → vincular empresa
3. Bloco → Blocos → Novo Bloco → vincular condomínio
4. Apartamentos → Importar via planilha (mais rápido para muitos)
   OU → Novo Apartamento (um a um)
5. Medidores → Importar via planilha
   OU → Novo Medidor → vincular apartamento + número de chassi
6. Dispositivos IoT → vincular ao medidor pelo chassi
7. Usuários → Novo Usuário → definir papel (Síndico / Morador)
```

**Tempo estimado para um condomínio de 50 aptos:** 2-3 horas com planilha, 1 dia manual.

---

### Fluxo 2 — Ciclo mensal de leituras

```
Dia 1-5 do mês:
→ Leiturista registra as leituras (ou IoT registra automaticamente)
→ Verificar: Leituras → filtrar mês atual → checar unidades sem leitura

Dia 5-10:
→ Registrar conta da concessionária (Contas → Nova Conta)
→ Conferir rateio automático

Dia 10-15:
→ Gerar filipetas (Filipeta Medição → selecionar mês)
→ Revisar: todas com foto? Todas com valores corretos?
→ Exportar PDF por condomínio
→ Enviar para moradores (email, WhatsApp, portal)
```

---

### Fluxo 3 — Morador consultando sua fatura

```
Login → 
Dashboard (vê consumo do mês em destaque) →
Filipeta (clica para ver o documento completo) →
Levantamento (se quiser ver histórico com fotos)
```

**Máximo de 3 cliques para qualquer informação** — regra de UX que o sistema deve sempre respeitar.

---

# PARTE 4 — GUIA DE QUALIDADE

## Capítulo 14 — O que define uma boa filipeta

Uma filipeta de qualidade deve ter:

- ✅ **Foto nítida do medidor** com o mostrador visível e legível
- ✅ **Numeração completa** — ex: 00457,862 (não apenas 457)
- ✅ **Data da leitura** coerente com o mês de referência
- ✅ **Consumo calculado corretamente** (atual - anterior = consumo)
- ✅ **Valores corretos** — soma de água/esgoto + área comum = total
- ✅ **Logo e nome do condomínio** identificados
- ✅ **Histórico dos últimos meses** para contexto

Uma filipeta ruim tem:
- ❌ Foto borrada, escura ou sem o mostrador
- ❌ Consumo negativo (leitura menor que anterior — erro de digitação)
- ❌ Valor zerado (sem conta de concessionária cadastrada)
- ❌ "Sem foto do medidor" — o leiturista esqueceu de tirar

---

## Capítulo 15 — Checklist de Qualidade Mensal

Use este checklist todo mês antes de enviar as filipetas:

**Leituras:**
- [ ] Todas as unidades têm leitura do mês?
- [ ] Alguma leitura está negativa ou com variação > 200%?
- [ ] Todas as fotos foram carregadas?

**Conta da Concessionária:**
- [ ] Conta do mês foi registrada?
- [ ] Consumo total da conta é compatível com a soma das unidades?

**Filipetas:**
- [ ] Todas as filipetas têm foto visível do medidor?
- [ ] Todos os valores estão preenchidos (não zerados)?
- [ ] Dados do condomínio estão corretos (nome, endereço)?

**Antes de enviar ao morador:**
- [ ] Imprimir uma filipeta de teste em PDF — foto aparece?
- [ ] Verificar no celular — foto está visível e legível?

---

# PARTE 5 — MELHORIAS FUTURAS

## Capítulo 16 — Roadmap de UX (O que deve ser feito a seguir)

### 🔴 Alta Prioridade (impacto imediato na experiência)

**1. Notificações em tempo real**
- Push notification no celular quando a leitura do mês chegar
- Alerta para o síndico: "Apt 201 consumiu 3x mais que o normal"
- Alerta para o morador: "Sua filipeta do mês de Março está disponível"
- Canal Telegram para alertas de caixa d'água

**2. App mobile nativo (Capacitor)**
- Transformar o site em app para iOS e Android
- Morador baixa o app, faz login, vê tudo sem precisar do navegador
- Push notifications nativas
- Camera integrada para o leiturista tirar a foto direto pelo app

**3. Escâner de chassi do medidor**
- Em vez de digitar `B24A0019474D` manualmente (e errar)
- Câmera escaneia o código de barras ou QR do medidor
- Vinculação automática

---

### 🟡 Média Prioridade (melhoria de eficiência)

**4. Linguagem simplificada para moradores**
- Substituir "m³" por algo mais intuitivo nas telas do morador
- Adicionar comparativo: "Você consumiu X% a mais/menos que a média do condomínio"
- Dica de economia personalizada

**5. Importação automática de planilha de condomínios**
- Quando o TI receber o banco antigo, importar tudo de uma vez
- Script de migração que lê o formato antigo e popula o novo banco

**6. Mapa do condomínio**
- Visualizar qual bloco/apartamento está com problema
- Cor vermelha no bloco que tem leitura pendente
- Cor amarela nos apartamentos com consumo anormal

**7. Relatório de comparação entre condomínios**
- Para o Administrador: ranking de consumo médio por condomínio
- Identificar o condomínio mais eficiente e o mais desperdiçador

---

### 🟢 Baixa Prioridade (nice to have)

**8. Modo escuro**
- Para uso noturno, especialmente leituristas que trabalham cedo
- Salvar preferência por usuário

**9. Múltiplos idiomas**
- Inglês e Espanhol para expansão futura

**10. Integração WhatsApp**
- Enviar a filipeta direto pelo WhatsApp Business da empresa
- Morador recebe o PDF no próprio WhatsApp

---

## Capítulo 17 — Como Coletar Feedback dos Usuários

O sistema melhora com base no que os usuários **realmente precisam**, não no que imaginamos que precisam. Métodos recomendados:

### Método 1 — Observação direta (mais valioso)
Sentar ao lado do leiturista ou do síndico enquanto ele usa o sistema pela primeira vez. Observar onde ele hesita, onde clica errado, onde pergunta "como faz isso?". Cada hesitação é uma oportunidade de melhoria.

### Método 2 — Entrevista de 5 minutos
Após 30 dias de uso, perguntar:
1. "Qual é a coisa que você mais usa no sistema?"
2. "Qual é a coisa mais difícil de fazer?"
3. "Se você pudesse mudar uma coisa, o que seria?"
4. "Tem algo que você precisa fazer e o sistema não deixa?"

### Método 3 — Análise de erros
Revisar mensagens de erro do sistema mensalmente. Se o mesmo erro aparece mais de 5 vezes, é um problema de UX, não de usuário.

### Método 4 — NPS simples
Uma vez por mês, exibir uma pergunta na tela: *"De 0 a 10, o quanto você recomendaria o AcquaX para outro síndico?"* Qualquer nota abaixo de 7 merece uma ligação.

---

# PARTE 6 — GLOSSÁRIO

## Capítulo 18 — Dicionário de Termos do Sistema

| Termo | O que significa |
|---|---|
| **Filipeta** | Documento individual de cobrança de água de cada apartamento. O equivalente a uma mini conta de água personalizada. |
| **Leitura** | Registro do valor mostrado no hidrômetro em uma data específica. Ex: 00457,862 m³ em 01/03/2026. |
| **Consumo** | Diferença entre leitura atual e leitura anterior. Ex: 457,862 - 444,194 = 13,668 m³. |
| **Chassi / Registro** | Número de série gravado no corpo do medidor. Identificador único. Ex: B24A0019474D. |
| **IoT** | "Internet of Things" (Internet das Coisas). Sensor eletrônico instalado no medidor que envia leitura automaticamente, sem precisar de leiturista. |
| **Broker MQTT** | Servidor intermediário que recebe as mensagens dos sensores IoT e repassa para o sistema. No nosso caso: GroupLink. |
| **Rateio** | Divisão proporcional do custo da área comum entre os apartamentos, baseado no consumo individual de cada um. |
| **Concessionária** | A empresa fornecedora de água (CESAN, SABESP, SANEAGO etc.). A conta que eles mandam é o que gera o rateio. |
| **Reservatório** | A caixa d'água do condomínio. O sistema monitora o nível em tempo real. |
| **Fração** | Percentual de participação do apartamento no rateio. Definido no contrato do condomínio. |
| **Complexo** | Nome técnico para "condomínio" dentro do sistema. Um complexo tem blocos, que têm apartamentos. |
| **m³** | Metro cúbico. Unidade de medida de volume de água. 1 m³ = 1.000 litros = aproximadamente 5 banhos de 15 minutos. |
| **Device ID** | Identificador único do sensor IoT. Diferente do chassi do medidor — o device é o sensor, o chassi é o medidor físico. |
| **remote_id** | O número que o sensor IoT informa para identificar qual medidor ele está lendo. Deve corresponder ao chassi. |
| **Levantamento** | Relatório comparativo de múltiplos meses, mostrando a evolução do consumo. |
| **Administradora** | Empresa que administra o condomínio (diferente do síndico, que é morador eleito). |

---

# APÊNDICE

## Apêndice A — Informações Técnicas de Integração IoT

### Broker MQTT
- **Endereço:** `mqtts://mqtt.grouplinknetwork.com:8883`
- **Protocolo:** MQTTS (MQTT com TLS/SSL)
- **Porta:** 8883
- **Autenticação:** Certificado SSL (arquivos na pasta `certs/`)
- **Tópicos escutados:** `message/#` (todos os condomínios)

### Formato da mensagem IoT recebida
```json
{
  "device_id": "1867651405",
  "last_seen": 1732565253000,
  "channels": [
    {
      "name": "Nome do canal",
      "remote_id": "B24A0019474D",
      "last_reading": 457.862,
      "read_at": "2026-03-01T14:32:00.000Z",
      "alerts": [],
      "device_pulse_factor": "1.0"
    }
  ]
}
```

### Condomínios ativos no broker (registrados em nov/2025)
- `message/acquax-do-brasil`
- `message/condominio-capri` / `message/condominio-capri-acquax`
- `message/poc-palmares`
- `message/praca-da-vila`
- `message/cond-suica-acquax-do-brasil`
- `message/deseo`
- `message/quintas`
- `message/versailles`
- `message/sophia-oceanic-acquax`
- `message/condominio-promenade`
- `message/east-sider-meier-acquax`
- `message/acquax-feiras`
- `message/cond-areia-preta`
- E outros

---

## Apêndice B — Checklist de Onboarding de Novo Condomínio

Quando um novo condomínio contratar a AcquaX, seguir esta ordem:

- [ ] 1. Cadastrar empresa administradora (se nova)
- [ ] 2. Cadastrar condomínio → vincular empresa
- [ ] 3. Preparar planilha de blocos/apartamentos
- [ ] 4. Importar blocos e apartamentos via planilha
- [ ] 5. Preparar planilha de medidores (chassi × apartamento)
- [ ] 6. Importar medidores via planilha
- [ ] 7. Cadastrar usuário Síndico → vincular ao condomínio
- [ ] 8. Cadastrar usuários Moradores (em lote, se possível)
- [ ] 9. Configurar tarifas (água + esgoto + área comum)
- [ ] 10. Fazer primeira leitura manual de todos os medidores
- [ ] 11. Vincular dispositivos IoT (se tiver) ao chassi do medidor
- [ ] 12. Gerar filipeta de teste antes de enviar ao morador
- [ ] 13. Treinamento de 30 min com o síndico (presencial ou video)
- [ ] 14. Enviar este livro ao síndico como guia de referência

---

## Apêndice C — Solução de Problemas Comuns

| Problema | Causa provável | Solução |
|---|---|---|
| Filipeta sem foto | Foto não foi carregada | Editar leitura e fazer upload novamente |
| Consumo negativo | Leitura atual menor que anterior | Corrigir a leitura ou verificar se medidor foi trocado |
| Valor zerado na filipeta | Sem conta de concessionária no mês | Cadastrar conta em "Contas" → mês de referência |
| Dispositivo IoT offline | Sem energia ou sem sinal | Verificar instalação física do sensor |
| Leitura IoT não aparece | Chassi do medidor não vinculado ao device | Ir em IOTs → vincular medidor ao device pelo chassi |
| Morador não consegue logar | Senha expirada ou email errado | Administrador → Usuários → Redefinir senha |
| Foto impressa em branco | Bug corrigido na v1.1 | Atualizar o sistema |

---

*Fim do Livro de Experiência do Usuário — AcquaX Control v1.0*
*Atualizado em: Março/2026*
*Próxima revisão prevista: Junho/2026 (após feedback dos primeiros 90 dias de operação)*

