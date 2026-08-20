# Acqua X Control — análise do sistema e roadmap de evolução

**Data da análise:** 20 de agosto de 2026  
**Escopo:** Dashboard Master, dados atualmente cadastrados, integrações, automações, segurança, performance e oportunidades de produto.

## 1. Correções aplicadas nesta atualização

O Dashboard Master recebeu três ajustes direcionados às imagens enviadas. O banner **Central Master** agora utiliza contraste explícito para temas claro e escuro, título com maior hierarquia visual, seletor mais alto e legível e estados de foco mais claros. Os cards **Mais atualizados**, **Menos atualizados**, **Mais acessados (30d)** e **Sem acesso (30d)** deixaram de depender de fundos translúcidos pouco contrastados; eles agora têm bordas, fundos e títulos mais definidos em ambos os temas.

O card **Saúde operacional** também foi refinado. Os indicadores de e-mail, integração GL e pendências passaram a usar caixas com bordas coloridas, títulos maiores e valores mais fáceis de escanear. A informação continua sendo a mesma, mas a leitura em telas escuras e em monitores com baixo contraste deve ficar substancialmente melhor.

O histórico de e-mails do Master foi ampliado. Cada disparo agora tenta exibir o contexto **Condomínio · Bloco · Unidade**, além do assunto e do período de referência. A API usa primeiro o relatório de consumo relacionado ao job e, para jobs antigos, utiliza os identificadores de apartamento e condomínio gravados diretamente no `EmailJob`. Quando o registro não permite identificar o contexto, a interface informa explicitamente **Contexto não identificado**, em vez de deixar o administrador deduzir pelo endereço de e-mail.

| Ajuste | Arquivo principal | Resultado esperado |
|---|---|---|
| Contraste do banner Master | [`app/(main)/dashboard/page.tsx`][1] | Título e seletor legíveis em modo claro e escuro |
| Contraste dos cards de ranking | [`app/(main)/dashboard/page.tsx`][1] | Menor dependência de transparência e melhor hierarquia |
| Saúde operacional | [`components/dashboard/OperationsHealthCard.tsx`][2] | Indicadores de e-mail, GL e pendências mais visíveis |
| Contexto dos disparos | [`app/api/debug/emails/route.ts`][3] | Condomínio, bloco e unidade no histórico de jobs |
| Apresentação do contexto | [`app/(main)/dashboard/page.tsx`][1] | Contexto exibido junto do destinatário e assunto |

O build de produção foi executado com sucesso no checkout completo do projeto. A análise de código abaixo considera a estrutura existente, sem presumir recursos que não estão presentes no repositório.

## 2. O que o sistema já entrega hoje

O sistema possui uma base funcional ampla. Ele combina cadastro hierárquico de empresa, condomínio, bloco, apartamento e medidor com relatórios de consumo, leitura por foto, concessionárias de água, gás e energia, integração GL/IoT, alertas, reservatórios, envio de e-mails, suporte, sugestões e APIs externas. Esse conjunto já permite posicionar o produto não apenas como uma tela de leitura, mas como uma plataforma de operação e acompanhamento de consumo.

| Área | Evidências encontradas no sistema | Valor que já pode ser entregue |
|---|---|---|
| Consumo e cobrança | `ApartmentConsumptionReport`, `DealershipReading`, `Filipeta`, `Levantamento` e `Apuração` | Consumo, valor da unidade, rateio de área comum, água/esgoto, período e próxima leitura |
| Leitura por foto | Modelo `Reading`, fotos do medidor, histórico e parser de datas | Evidência visual da leitura e comparação entre períodos |
| Água, gás e energia | `utilityType`, concessionárias e rotas de relatórios | Mesmo fluxo operacional para múltiplos serviços |
| GL/IoT | `MeterDeviceLink`, `IotDevice`, leituras GL, diagnósticos e alarmes | Monitoramento, importação, falhas e alertas operacionais |
| Reservatórios | `Reservoir`, `ReservoirReading` e rotas de monitoramento | Acompanhamento de nível e disponibilidade hídrica |
| Comunicação | `EmailJob`, fila, templates, disparos, cron e resumo mensal | Entrega automática de filipetas e insights |
| Governança | Usuários, papéis, permissões, suporte, sugestões, logs e API keys | Controle por perfil, atendimento e integração externa |
| Integração | Webhooks, entregas de webhook, API v1 e logs | Conexão com parceiros e sistemas de administradoras |

A base de dados é particularmente rica para análises porque já guarda datas de leitura, leituras anterior e atual, consumo, custos, rateio proporcional, concessionária, unidade, condomínio, medidor, dispositivos e estado de envio. A recomendação é transformar esses dados em indicadores explicativos, em vez de apenas reproduzi-los em listas.

## 3. Melhorias de maior impacto

### 3.1 Centro de saúde operacional

O Dashboard Master deveria ter uma visão única de saúde do sistema, com quatro dimensões: **atualidade dos dados**, **qualidade da importação**, **entrega de comunicação** e **situação dos dispositivos**. Hoje já existem peças para isso — saúde de e-mails, integração GL, pendências, logs e alarmes — mas elas aparecem separadas.

A primeira versão pode apresentar, por condomínio, a última leitura recebida, horas desde a última atualização, percentual de unidades com leitura no período, quantidade de referências pendentes, quantidade de falhas GL, e-mails falhos e alarmes não reconhecidos. O indicador deve possuir uma ação direta: abrir o condomínio, reprocessar a importação, reenviar e-mail ou visualizar os apartamentos afetados.

| Indicador recomendado | Fonte já existente | Regra sugerida |
|---|---|---|
| Atualização do condomínio | `Reading`, `DealershipReading`, `GlImportLog` | Verde até o SLA definido; amarelo próximo do limite; vermelho após o limite |
| Cobertura do período | `ApartmentConsumptionReport` por condomínio | Unidades com relatório dividido pelo total de unidades ativas |
| Referências pendentes | Dados de leitura e datas do relatório | Lista direta das unidades sem período ou próxima leitura |
| Saúde de e-mail | `EmailJob` e resumo operacional | Pendentes, enviados, falhos, taxa de falha e último envio |
| Saúde GL | `GlImportLog`, leituras GL e diagnósticos | Última execução, importados, ignorados e erros |
| Alertas ativos | `GlAlarm` e alertas de monitoramento | Não reconhecidos, reincidentes e tempo aberto |

### 3.2 Dashboard do síndico e da administradora

Síndicos e administradoras deveriam receber um **resumo executivo mensal do condomínio** sempre que o consumo fosse fechado. O resumo poderia conter consumo total, média por unidade, cinco maiores variações, unidades sem leitura, consumo de área comum, falhas de importação, situação de e-mails e alertas de vazamento. O sistema já possui serviço de insights mensais e jobs agendados, portanto a evolução principal é melhorar o conteúdo e a explicabilidade.

É importante separar claramente três conceitos que costumam gerar dúvidas: **consumo individual**, **custo de água/esgoto** e **rateio de área comum**. Cada gráfico deve explicar sua unidade de medida, o período e a comparação utilizada. Para administradoras, a visão deve permitir comparar condomínios por atualização, cobertura de leitura, consumo médio e pendências, sem misturar dados entre clientes.

### 3.3 Experiência do morador

O morador já pode receber uma experiência mais valiosa usando os dados existentes. O dashboard pode mostrar o consumo do mês, variação percentual contra o mês anterior, média de seis ou doze meses, valor individual, valor específico de área comum, período da leitura, próxima leitura, foto da leitura atual e um aviso simples quando houver comportamento atípico.

A funcionalidade de metas de consumo já possui indícios de implementação por meio de rotinas de verificação de objetivos. Ela deve aparecer como uma configuração simples por condomínio ou unidade: meta mensal, aviso em 50%, aviso em 80% e aviso ao ultrapassar 100%. O morador não precisa conhecer o cálculo interno; deve receber uma mensagem objetiva com consumo atual, limite, projeção e ação recomendada.

### 3.4 Área comum e explicação do valor

O valor de área comum é uma oportunidade importante de confiança. A tela deve mostrar, para cada mês, **quanto a unidade pagou**, qual foi o valor total de área comum do condomínio, qual regra de rateio foi aplicada e qual foi a participação percentual da unidade. A informação precisa evitar a impressão de que o morador está vendo o total do condomínio como se fosse o seu valor.

Uma melhoria adicional seria um cartão “Como chegamos a este total”, com a decomposição: consumo individual, água/esgoto, área comum, ajustes e total. Esse cartão pode reaproveitar `partial`, `totalUnit`, custos de consumo e campos da concessionária, sem alterar o modelo de dados.

### 3.5 Comunicação e rastreabilidade

O histórico de e-mails agora mostra o contexto do disparo no Dashboard Master. O próximo passo recomendado é criar uma tela de detalhe do job com destinatário, condomínio, bloco, unidade, referência, status, tentativas, erro retornado, horário de criação, horário de envio e ação de reprocessamento.

Também vale separar métricas de **aceitação pelo provedor**, **entrega**, **falha permanente** e **falha temporária**. O status atual `sent`, `failed`, `pending` e `skipped` é suficiente para uma primeira operação, mas não para diagnosticar todos os casos. A fila deve evitar duplicidade por unidade, período e tipo de mensagem, e deve registrar o motivo quando um e-mail for ignorado por regra de fallback ou domínio.

### 3.6 Monitoramento GL, vazamentos e reservatórios

A plataforma já possui os componentes necessários para uma central de prevenção: leituras GL, alarmes, detecção de vazamento, metas de consumo, alertas e reservatórios. O ganho de produto virá da consolidação em uma linha do tempo por condomínio e unidade. Cada evento deve mostrar quando começou, qual valor disparou o alerta, quem foi avisado, se foi reconhecido e se voltou ao normal.

Para o morador, a mensagem deve ser contextualizada e não alarmista. Para o síndico, deve conter severidade, duração, unidade/bloco e ação recomendada. Para o Master, deve mostrar recorrência por condomínio, tempo médio de resolução e taxa de falsos positivos.

## 4. Performance e confiabilidade

As correções recentes mostram que o sistema possui múltiplas consultas e contextos de permissão que podem se sobrepor. Para manter velocidade com condomínios de centenas ou milhares de unidades, recomendo as seguintes medidas: paginação server-side em listas grandes; cache curto por contexto e período; agregações pré-calculadas para cards; carregamento sob demanda de gráficos; e um endpoint consolidado para o resumo de cada dashboard.

O Master não deveria recalcular todos os rankings e contagens sempre que a tela abre. Um resumo diário ou por hora pode alimentar os cards de panorama, enquanto o detalhamento continua sob demanda. Para a Filipeta e o Levantamento, a resposta inicial deve conter apenas os campos necessários à listagem; fotos e detalhes completos podem ser carregados quando o usuário expande ou imprime.

| Risco atual | Sintoma possível | Melhoria recomendada |
|---|---|---|
| Consultas repetidas por contexto | Dashboard demora ou oscila | Cache de sessão e endpoint consolidado |
| Listas sem paginação | Filipeta pesada em grandes condomínios | Paginação, filtros no servidor e exportação assíncrona |
| Muitas imagens na mesma tela | Impressão lenta ou memória alta | Lazy loading, lote de impressão e ZIP assíncrono |
| Falhas de importação pouco explicadas | Dados atrasados sem diagnóstico rápido | Painel de SLA, logs por etapa e reprocessamento |
| Fila de e-mail sem detalhe operacional | Síndico recebe, unidade não recebe | Job detalhado por destinatário e reenvio isolado |
| Datas legadas e vínculos incompletos | `ref. pend.` | Normalização na ingestão e relatório de qualidade |

## 5. Segurança e governança

A separação por contexto de usuário, condomínio, bloco, apartamento e papel deve continuar sendo tratada como requisito de segurança, não apenas como filtro de interface. Toda API de listagem, exportação, suporte, sugestões, e-mail e relatório deve validar o vínculo no servidor. O modo de visualização do Master deve permanecer explicitamente separado da autorização real, com indicação visual e sem permitir que o contexto de preview seja confundido com os dados do usuário logado.

Sugiro acrescentar um **log de auditoria de ações sensíveis** com usuário, papel efetivo, IP ou identificador de sessão, recurso, ação, resultado e entidade afetada. As ações prioritárias são: disparo de e-mail, reprocessamento de importação, alteração de permissões, exclusão ou moderação de sugestão, alteração de vínculo GL, exportação de dados e reset de senha.

## 6. Roadmap recomendado

| Prioridade | Entrega | Motivo |
|---|---|---|
| P0 | Centro de saúde por condomínio com SLA e unidades afetadas | Reduz reclamações e acelera diagnóstico operacional |
| P0 | Detalhe e reprocessamento de `EmailJob` por unidade | Resolve o problema de “síndico recebeu, morador não recebeu” com rastreabilidade |
| P0 | Qualidade de dados do período: referências, leituras e cobertura | Impede que relatórios sejam publicados com lacunas silenciosas |
| P1 | Resumo mensal automático para síndico/administradora | Aumenta valor percebido sem exigir leitura manual do sistema |
| P1 | Explicação do total do morador e área comum individual | Aumenta confiança e reduz dúvidas sobre cobrança |
| P1 | Metas, alertas de 50/80/100% e vazamento com contexto | Transforma histórico em prevenção prática |
| P1 | Paginação e exportação assíncrona para Filipeta/Levantamento | Suporta condomínios maiores sem travar navegador ou tablet |
| P2 | Comparativo entre condomínios para administradoras | Cria visão gerencial e potencial de serviço premium |
| P2 | Linha do tempo de incidentes GL, e-mails e reservatórios | Melhora auditoria, SLA e gestão de recorrência |
| P2 | Portal de integração com API keys, webhooks e documentação | Facilita parceiros e reduz operações manuais |

## 7. Conclusão

A Acqua X Control já possui os elementos de um produto completo: captura de leitura, cálculo e rateio, emissão de filipeta, múltiplos serviços, integração IoT/GL, alertas, reservatórios, automação de e-mails e governança por perfis. O maior ganho agora não está em criar mais telas isoladas, mas em **organizar os dados existentes em decisões claras**: o que está atualizado, o que falhou, quem foi afetado, qual valor foi calculado e qual ação deve ser tomada.

Minha recomendação é priorizar a confiabilidade operacional e a explicação dos valores antes de adicionar novas funcionalidades de menor impacto. Um Master que identifica rapidamente condomínios atrasados, um síndico que recebe um resumo acionável e um morador que entende exatamente seu total formam uma proposta de valor mais forte do que simplesmente ampliar o número de menus.

## Referências do código

[1]: https://github.com/tiacquax-web/AcquaXcontrol/blob/main/app/(main)/dashboard/page.tsx "Dashboard principal e AdminKPIDashboard"
[2]: https://github.com/tiacquax-web/AcquaXcontrol/blob/main/components/dashboard/OperationsHealthCard.tsx "Card de saúde operacional"
[3]: https://github.com/tiacquax-web/AcquaXcontrol/blob/main/app/api/debug/emails/route.ts "API de histórico e saúde de e-mails"
[4]: https://github.com/tiacquax-web/AcquaXcontrol/blob/main/prisma/schema.prisma "Modelos e relações do banco de dados"
[5]: https://github.com/tiacquax-web/AcquaXcontrol/tree/main/app/api "Rotas de API do sistema"
[6]: https://github.com/tiacquax-web/AcquaXcontrol/tree/main/lib/services "Serviços de e-mail, GL, IoT, alertas e importação"
