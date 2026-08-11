# Acqua X Control — Diagnóstico e Roadmap de Evolução

## Alterações implementadas nesta rodada

| Área | Entrega | Resultado esperado |
|---|---|---|
| Levantamento | Período inicial/final, próxima leitura prevista, fallback pelo total de dias e exibição na tabela expandida e nos cartões | O usuário visualiza o mesmo contexto de referência presente na filipeta, sem precisar interpretar apenas o mês/ano |
| E-mail mensal | Novo extrato HTML/texto com índices inicial/final, consumo no período, composição de valores, dados do condomínio, período de referência, próxima leitura, análise histórica, alertas e link para o sistema | Comunicação mais clara, próxima do modelo de mercado e com dados adicionais úteis |
| Fila de e-mails | Worker automático e endpoint manual passaram a carregar relatório anterior e conta da concessionária | O novo template recebe dados reais em vez de apresentar campos vazios |
| Integração GL/S3 | Cron passou a reprocessar uma janela configurável de dias, com padrão de 7 dias | Uma falha ou atraso pontual do cron não deixa o sistema permanentemente desatualizado |
| Alarmes GL | Deduplicação por `remoteId`, código e instante do alarme | Reprocessamentos não duplicam registros nem disparam novamente notificações já importadas |
| Monitoramento | Indicador de saúde dos dados com última leitura, idade e estado atualizado/atrasado/sem dados | Moradores, síndicos e administradores percebem imediatamente quando a integração está parada |

## Diagnóstico da interrupção desde 05/08

O pipeline atual recebe arquivos do fornecedor por S3, usando o prefixo diário `GL_S3_PATH_PREFIX/AAAA/MM/DD/`. O cron da Vercel estava executando apenas o dia corrente em dois horários, 10:00 e 22:00 UTC. Esse desenho é frágil: se o arquivo chega atrasado, o cron falha, o `CRON_SECRET` diverge ou existe uma indisponibilidade temporária do S3, o dia é perdido e não é recuperado automaticamente.

A rota administrativa de diagnóstico já verifica as variáveis de ambiente, a quantidade de medidores com `glId`, o acesso ao prefixo S3 de uma data específica, a leitura mais recente gravada e os últimos `GlImportLog`. Ela deve ser usada em produção para confirmar qual dos quatro cenários ocorreu: ausência de arquivo no S3, falha de credenciais/permissão, falta de correspondência entre `remote_id` e `meter.glId`, ou falha de gravação no MongoDB.

Sem uma sessão administrativa na produção, não é possível afirmar por inspeção local qual desses cenários ocorreu em 05/08. A correção de código reduz o risco daqui em diante: cada execução reprocessa os últimos sete dias por padrão e o importador de alarmes foi tornado idempotente. Após o deploy, a operação recomendada é consultar a aba de integração GL para confirmar os resultados por data e, se necessário, executar a importação retroativa de 05/08 até a data atual.

## Como validar a recuperação em produção

| Verificação | Critério de sucesso |
|---|---|
| Diagnóstico S3 para 05/08 | `conexão OK` e arquivos encontrados maior que zero |
| Medidores vinculados | A maioria dos medidores ativos possui `glId` preenchido |
| Última leitura no banco | A data mais recente avança para a data efetivamente disponibilizada pelo fornecedor |
| Logs GL | Existem execuções após 05/08 sem `errorMessage` crítico e com `imported` maior que zero |
| Monitoramento | O cartão de saúde mostra “Dados atualizados” após selecionar o condomínio/medidores |
| Alarmes | Reprocessar o mesmo dia não cria alarmes duplicados nem dispara e-mails repetidos |

## Roadmap priorizado

### Prioridade P0 — confiabilidade operacional

A primeira prioridade é transformar a ingestão em um processo observável. O sistema deve registrar o estado de cada etapa — arquivo localizado, arquivo baixado, linhas processadas, linhas vinculadas, linhas descartadas e falha de persistência — e gerar um alerta administrativo quando a última importação bem-sucedida ultrapassar o SLA definido para o fornecedor. O painel administrativo também deve mostrar uma linha do tempo de saúde por condomínio, não apenas o último log global.

A fila de e-mails deve receber a mesma política de observabilidade: quantidade pendente, idade do job mais antigo, taxa de falha, último SMTP bem-sucedido e motivo agrupado das falhas. Um job de reenvio deve exigir seleção explícita de período, condomínio e tipo de mensagem, com modo de pré-visualização e confirmação para evitar disparos acidentais.

### Prioridade P1 — experiência do morador e do administrador

O extrato mensal deve permitir visualizar, além do resumo, o histórico de seis a doze meses, comparação com a média da unidade, comparação com a média do condomínio, consumo diário quando houver dados IoT e explicação simples de qualquer rateio. Cada valor deve indicar a unidade — m³, R$ ou data — e o sistema deve diferenciar claramente “sem leitura”, “leitura pendente”, “consumo zero” e “dado não recebido”.

Na aba de monitoramento, a experiência deve começar com um resumo semântico: última leitura, intervalo coberto, unidades online, unidades sem atualização, alertas críticos e consumo estimado. Os filtros técnicos de sigma, modo e tipo de alerta podem continuar disponíveis, mas devem ficar em uma área avançada para não sobrecarregar moradores e síndicos.

### Prioridade P1 — notificações inteligentes

Os alertas devem possuir severidade, deduplicação, janela de silêncio e confirmação de recebimento. Um mesmo evento não deve gerar vários e-mails a cada reprocessamento. Moradores devem receber somente eventos da própria unidade; síndicos e administradores devem receber uma visão consolidada do condomínio, com agrupamento por bloco, unidade, tipo e criticidade.

O e-mail de consumo deve ser enviado somente após a validação de integridade do relatório. Se a leitura atual ou o período estiverem ausentes, o sistema deve criar uma pendência operacional em vez de enviar um extrato incompleto silenciosamente.

### Prioridade P2 — análise e prevenção

Com histórico suficiente, o sistema pode estimar a faixa esperada de consumo por unidade e por condomínio, identificar mudanças persistentes, sugerir possíveis vazamentos e comparar consumo entre períodos equivalentes. A previsão deve ser apresentada como faixa e nível de confiança, nunca como certeza absoluta.

Também é recomendável criar um score de saúde por medidor baseado em recência, quantidade de leituras válidas, variação anormal, alarmes e qualidade do vínculo GL. Esse score ajudará o administrador a priorizar manutenção antes que o morador perceba uma falha.

### Prioridade P2 — gestão e auditoria

Cada importação e cada envio deve possuir rastreabilidade completa: quem iniciou, quando iniciou, quais arquivos foram considerados, quais registros foram criados, quais foram ignorados e qual foi a causa de cada erro. Alterações em consumo, tarifa, rateio e vínculos de medidor devem registrar valor anterior, valor novo e usuário responsável.

O sistema deve oferecer exportação CSV/XLSX, PDF padronizado, filtros salvos por administrador e relatórios agendados por condomínio. O relatório deve preservar um identificador de versão para que o conteúdo enviado por e-mail possa ser auditado posteriormente.

### Prioridade P3 — diferenciação de produto

Para se posicionar acima das alternativas atuais, o Acqua X Control pode oferecer uma central de transparência para o condomínio, com metas de redução, ranking opcional de eficiência sem expor dados sensíveis, histórico de economia, comunicados da administração e explicações acessíveis sobre leitura, consumo e rateio.

A arquitetura deve ser preparada para múltiplas concessionárias e fornecedores IoT, usando adaptadores por origem de dados. Assim, a troca de fornecedor não exige reescrever o painel, os relatórios ou as notificações.

## Próximas decisões recomendadas

1. Confirmar em produção, pela aba de integração GL, se existem arquivos no S3 entre 05/08 e a data atual.
2. Executar a importação retroativa do intervalo ausente depois do deploy e conferir `imported`, `skipped` e `errors` por dia.
3. Confirmar com o novo condomínio quais campos de custo representam exatamente consumo, esgoto, rateio, carro-pipa e valor total na regra contratada.
4. Definir o SLA de atualização por fornecedor, por exemplo, “dados atualizados em até 6 horas” e “alerta crítico após 24 horas”.
5. Criar testes automatizados para: e-mail completo, datas de período, reprocessamento idempotente, arquivo S3 ausente, medidor sem `glId` e fila SMTP indisponível.
