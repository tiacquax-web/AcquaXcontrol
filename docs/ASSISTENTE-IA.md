# Assistente IA do AcquaXcontrol — proposta técnica

Status: Fase 0 implementada (código no repositório, falta a chave de IA para ligar). Data: 03/11/2026.

## Decisões tomadas (03/11/2026)

- **Provedor**: Google Gemini (`gemini-2.5-flash`), via REST com function calling. Chave em
  `GEMINI_API_KEY` (opcionalmente `GOOGLE_API_KEY`); modelo ajustável em `GEMINI_MODEL`.
- **Escopo**: consultas + ações + suporte (tudo), entregues em fases.
- **Troca de e-mail**: o usuário já está autenticado no sistema para usar o assistente, então a
  troca é sempre da própria conta (a ferramenta ignora qualquer id vindo do modelo e usa o id da
  sessão). O sistema já avisa/envia credenciais para o novo e-mail pelo fluxo existente de usuário.

## 1. Objetivo

Assistente conversacional dentro do AcquaXcontrol para dois públicos:

- **Morador**: dúvidas simples do condomínio, entender a filipeta, ver o levantamento,
  análise do consumo anual da própria unidade, troca de e-mail com reenvio de
  credenciais, abertura/acompanhamento de chamado.
- **Síndico / administradora**: panorama do condomínio (consumo por bloco/unidade,
  variações, unidades sem leitura), apoio na operação e triagem dos chamados.

O assistente **não substitui** o atendente humano: resolve o repetitivo e escala o
resto com o contexto já montado.

## 2. Princípio central da arquitetura

> A IA nunca consulta o banco direto. Ela chama as **APIs internas já existentes**,
> com a **sessão do próprio usuário**.

Isso resolve os dois maiores riscos do recurso:

- **Permissão e escopo**: `/api/meter-report` já restringe morador aos próprios
  apartamentos (`contexts.apartmentIds`), síndico ao condomínio. Chamando o tool com o
  cookie do morador, ele não vê outra unidade nem se o modelo "pedir".
- **LGPD**: o assistente herda a mesma política de acesso da tela. Não existe uma
  segunda regra de autorização para manter em sincronia.

Cada nova capacidade = 1 tool reaproveitando rota existente (ou rota pequena criada
para a tela, que a IA também passa a usar).

## 3. Componentes

| Peça | O que é |
|---|---|
| `POST /api/assistant/chat` | Rota Node.js com streaming (SSE). Recebe mensagem, monta contexto do usuário e roda o loop de tool-calling. |
| `lib/services/assistant/tools.ts` | Definição das ferramentas (nome, schema, ação). |
| `lib/services/assistant/policy.ts` | Guardrails: papéis, ações que exigem confirmação, limites. |
| `lib/services/assistant/prompt.ts` | System prompt por persona (morador / síndico / atendente). |
| `AssistantConversation` + `AssistantMessage` (Prisma) | Histórico por usuário e auditoria de tool calls. |
| `FaqItem` (Prisma) | Perguntas/respostas cadastradas, por condomínio (opcional global). |
| Widget / página | Painel flutuante nas telas do morador + aba na `/suporte` para o síndico. |

Modelo sugerido: modelo pequeno com bom tool-calling (`gpt-4.1-mini`/`gpt-4o-mini`,
`claude-haiku`, `gemini-flash`). A maioria das respostas é curta e baseada em dados
estruturados, não exige modelo caro.

## 4. Ferramentas (tools) por fase

### Fase 1 — leitura e explicação (somente GET, risco baixo)

| Tool | Reaproveita |
|---|---|
| `minha_unidade()` | `/api/user/my-context` |
| `minha_filipeta(mes, ano)` | `/api/meter-report` |
| `meu_levantamento(meses)` | `/api/meter-report` (série histórica) |
| `analise_consumo_anual()` | 12 meses + comparação com a média da própria unidade |
| `explicar_filipeta()` | texto do guia interno (`/guia`) |
| `faq(tema)` | `FaqItem` filtrado pelo condomínio do usuário |
| `abrir_chamado(assunto, descricao)` | `SupportTicket` + `SupportMessage` |

Cobre os pedidos mais fortes: "explica minha filipeta", "por que meu consumo subiu",
"me mostra o ano", "onde vejo a tarifa".

### Fase 2 — ações com confirmação explícita

| Tool | Regra |
|---|---|
| `alterar_meu_email(novo_email)` | Código de confirmação para o **e-mail atual** antes de trocar; só então dispara credenciais para o novo. Nunca troca no primeiro pedido. |
| `reenviar_credenciais()` | Reset imediato (SMTP direto) para o e-mail cadastrado. |
| `segunda_via_filipeta(mes, ano)` | Reenfileira envio via `EmailJob` (ritmo 25-90s, teto 60/h). |
| `meus_chamados()` | Lista e status dos próprios tickets. |

### Fase 3 — síndico / administradora

`resumo_condominio(mes)`, `unidades_sem_leitura()`, `variacao_por_bloco()`,
`unidades_com_consumo_atipico()`, `disparar_comunicado(...)` (com aprovação humana).

### Fase 4 — suporte

Triagem automática de `SupportTicket` (classifica: filipeta, acesso, leitura, cadastro,
financeiro), resposta **sugerida** ao atendente (human-in-the-loop, sem envio
automático no início), resumo do histórico do morador e alerta de SLA.

## 5. Guardrails (não negociáveis)

1. **Escopo de dados**: morador só acessa a própria unidade. Toda tool roda com o
   cookie do usuário; se a rota negar, o assistente informa que não tem acesso.
2. **Nunca** responder dado de outra unidade, mesmo que o usuário insista.
3. **Ações sensíveis** (e-mail, senha, comunicado em massa) exigem confirmação em dois
   passos e ficam registradas em `AssistantMessage`.
4. **Conteúdo de dados é dado, não instrução**: texto de leitura, ticket ou FAQ nunca
   altera as regras do assistente (proteção contra prompt injection).
5. **Transparência**: a interface deixa claro que é assistente virtual e oferece
   "falar com uma pessoa" sempre.
6. **Auditoria**: guardar pergunta, ferramentas chamadas, resposta e resultado.
7. **Limites**: N mensagens/usuário/hora, teto de tokens por conversa, corte em loop de
   tool-calling (máx. 4 iterações).
8. **Sem decisão financeira**: não gera desconto, isenção, segunda via de boleto nem
   altera valor de conta.

## 6. Custo e operação

- Modelo pequeno: custo por conversa na casa de centavos; o que pesa é volume.
- Mitigações: FAQ cadastrada responde **sem** chamar o modelo, cache das explicações
  padrão, teto de tokens, resumo do histórico em vez da conversa inteira.
- Monitoramento: contador de tokens e de tool calls na saúde do sistema, junto do
  painel de e-mails existente.

## 7. Fases de entrega

| Fase | Escopo | Critério de aceite |
|---|---|---|
| 0 | Esqueleto: rota + widget + tool `minha_filipeta` + log | Morador pergunta "minha filipeta de outubro" e recebe os números corretos |
| 1 | FAQ do condomínio + levantamento + análise anual + abrir chamado | Maioria das dúvidas repetitivas resolvidas sem atendente |
| 2 | Ações: e-mail com confirmação, credenciais, 2ª via | Troca de e-mail só conclui após confirmar no e-mail antigo |
| 3 | Síndico: resumos e unidades sem leitura | "Como está o consumo do condomínio em outubro" responde certo |
| 4 | Suporte: triagem + resposta sugerida | Atendente aprova sugestão em 1 clique |

## 8. O que já está no código (Fase 0)

| Arquivo | Papel |
|---|---|
| `lib/services/assistant/gemini.ts` | Cliente Gemini (generateContent + function calling), chave só no servidor |
| `lib/services/assistant/tools.ts` | Ferramentas: `minha_unidade`, `minha_filipeta`, `meu_historico_consumo`, `abrir_chamado`, `alterar_meu_email` |
| `lib/services/assistant/prompt.ts` | System prompt com as regras invioláveis |
| `app/api/assistant/chat/route.ts` | Rota do chat: valida sessão, roda até 4 rodadas de tool calling, limite de 40 mensagens/hora por usuário |
| `components/assistant/AssistantWidget.tsx` | Botão flutuante + painel de conversa (montado em `app/(main)/layout.tsx`) |

Para ligar: cadastrar `GEMINI_API_KEY` na Vercel (produção e preview) e redeployar.

## 9. Próximos passos

1. Ligar a chave e validar a Fase 0 com um morador de teste (filipeta de outubro + consumo do ano).
2. FAQ por condomínio (`FaqItem`) para responder sem chamar o modelo.
3. Auditoria em banco (`AssistantConversation`/`AssistantMessage`).
4. Síndico: `resumo_condominio`, `unidades_sem_leitura`, `variacao_por_bloco`.
5. Suporte: triagem de tickets e resposta sugerida ao atendente.
