# 📖 Guia de Passo a Passo — AcquaXControl

**Acesso:** [www.acquaxcontrol.com.br](https://www.acquaxcontrol.com.br)

---

## 1. Como acessar o sistema

### Primeiro acesso
1. Abra o navegador e acesse **www.acquaxcontrol.com.br**
2. Você será redirecionado para a tela de login
3. Digite seu **email** e **senha** (fornecidos pela AcquaX ou pela administradora do condomínio)
4. Clique em **Entrar**

### Esqueci a senha
1. Na tela de login, clique em **"Esqueci a senha"**
2. Digite seu email cadastrado
3. Você receberá um link de redefinição por email
4. Abra o email, clique no link e cadastre uma nova senha

### Instalar no celular (PWA)
**Android (Chrome):**
1. Abra **www.acquaxcontrol.com.br** no Chrome
2. Toque no menu (três pontinhos no canto superior direito)
3. Selecione **"Instalar aplicativo"**
4. Confirme a instalação — o ícone aparecerá na tela inicial

**iPhone (Safari):**
1. Abra **www.acquaxcontrol.com.br** no Safari
2. Toque no botão **Compartilhar** (quadrado com seta para cima)
3. Selecione **"Adicionar à Tela de Início"**
4. Toque em **Adicionar** — o ícone aparecerá na tela inicial

---

## 2. Guia para o Morador 🏠

### Ver meu consumo
1. Faça login no sistema
2. A tela inicial (Dashboard) já mostra:
   - Gráfico com o consumo dos últimos 12 meses
   - Preview das 3 últimas filipetas
   - Valor a pagar do mês mais recente

### Ver a filipeta do mês
1. Na tela inicial, clique em uma das filipetas recentes (preview na parte inferior)
2. Ou clique em **Filipeta Medição** no menu lateral
3. Selecione o mês desejado
4. A filipeta exibe:
   - Dados do condomínio e unidade
   - Foto do medidor
   - Leitura atual e anterior
   - Consumo do mês em m³
   - Histórico de consumo (6 meses)
   - Valor a pagar

### Acompanhar histórico de consumo
1. Clique em **Levantamento** no menu lateral
2. Selecione os meses que deseja comparar (use os filtros no topo)
3. O sistema exibe:
   - Cards com a foto do medidor de cada mês
   - Gráfico de consumo médio
   - Tabela de detalhamento com consumo e valores por mês
4. Clique em uma foto para ampliá-la

### Receber a filipeta por email
- Você recebe automaticamente um email com o resumo da fatura quando uma nova leitura é processada
- O email contém um link direto para a filipeta completa no sistema
- Verifique sua caixa de entrada e pasta de spam. O remetente é **sistema@acquaxdobrasil.com.br**

---

## 3. Guia para o Síndico 🔑

### Visão geral do condomínio
1. Faça login — a tela inicial mostra um painel por condomínio com:
   - Resumo de consumo
   - Conta da concessionária
   - Status dos dispositivos IoT (se aplicável)
   - Unidades com consumo anormal

### Ver consumo por unidade
1. Clique em **Levantamento** no menu lateral
2. Selecione o condomínio e o período
3. Use o filtro de busca para encontrar uma unidade específica
4. A tabela mostra: leitura atual, leitura anterior, consumo (m³), valor a pagar
5. Clique em uma unidade para ver os cards de foto por mês

### Verificar filipetas do condomínio
1. Clique em **Filipeta Medição** no menu lateral
2. Selecione o mês desejado
3. Navegue pelas filipetas de cada unidade
4. Use a impressão (Ctrl+P / Cmd+P) para gerar PDF

### Gerar relatório de consumo
1. Clique em **Relatórios** no menu lateral
2. Selecione o condomínio, bloco e período
3. Clique em **Gerar Relatório**
4. O relatório exibe consumo por unidade com totais

### Monitorar consumo em tempo real (se o condomínio tem IoT)
1. Clique em **Monitoramento** no menu lateral
2. Veja o consumo atual de cada medidor conectado
3. Gráfico de consumo por hora/dia/mês

### Verificar alertas
1. Clique em **Central de Alertas** no menu lateral
2. Veja alertas de: consumo anormal, vazamento, dispositivo offline, nível crítico de reservatório
3. Cada alerta mostra a data, severidade e unidade afetada

### Monitorar nível do reservatório
1. Clique em **Medidores de Nível** no menu lateral
2. Veja o nível atual de cada reservatório
3. Gráfico de histórico do nível

---

## 4. Guia para Administradora 🏢

### Acompanhar condomínios da carteira
1. Faça login — a tela inicial lista os condomínios que você administra
2. Para cada condomínio, veja: resumo de consumo, conta da concessionária, status

### Baixar filipetas e relatórios
1. Clique em **Filipeta Medição** no menu lateral
2. Selecione o mês desejado
3. Use **Ctrl+P** para imprimir ou salvar como PDF
4. Ou clique em **Relatórios** para gerar relatórios consolidados

### Cadastrar contas de concessionária
1. Clique em **Contas** no menu lateral
2. Selecione o condomínio
3. Informe o número da conta, valor, período e vencimento
4. Esta conta serve de base para o rateio entre as unidades

---

## 5. Guia para Administrador 👔

### Visão estratégica (Dashboard)
1. Faça login — a tela inicial mostra KPIs globais:
   - Total de condomínios cadastrados
   - Condomínios com pendências
   - Alertas ativos
   - Consumo total
2. Clique em um condomínio para ver detalhes

### Supervisionar todos os condomínios
1. Use **Relatórios** para gerar relatórios consolidados
2. Use **Levantamento** para comparar consumo entre condomínios
3. Filtre por período e condomínio conforme necessário

### Gerenciar chaves de API
1. Clique em **API** no menu lateral (grupo Integrações)
2. Clique em **Nova Chave** para gerar uma chave de acesso
3. Copie a chave (ela não será mostrada novamente)
4. Use a chave para integrar sistemas externos
5. Para revogar: clique no ícone de lixeira ao lado da chave

---

## 6. Guia para Programador 👨‍💻

### Cadastrar um novo cliente completo (fluxo completo)
1. **Administradoras:** Clique em **Administradoras** → Nova → preencha nome e CNPJ
2. **Condomínio:** Clique em **Condomínios** → Novo → preencha nome, endereço, vincule à administradora
3. **Bloco:** Clique em **Blocos** → Novo → vincule ao condomínio → dê o nome (ex: "Bloco A")
4. **Apartamento:** Clique em **Apartamentos** → Novo → vincule ao bloco → informe o número
5. **Medidor:** Clique em **Medidores** → Novo → vincule ao apartamento → informe o número do medidor e tipo
6. **Usuários:** Clique em **Usuários** → crie ou importe em lote (ver abaixo)

### Importar usuários em lote (planilha Excel)
1. Clique em **Usuários** no menu lateral
2. Vá para a aba **Importar**
3. Selecione o condomínio
4. Arraste uma planilha Excel (.xlsx) com as colunas: Bloco, Apartamento, Nome, Email
5. O sistema identifica:
   - **Novos usuários:** cria conta com senha temporária e envia email de boas-vindas
   - **Usuários existentes:** vincula a nova unidade à conta existente
   - **Usuários atualizados:** atualiza os dados sem gerar nova senha
6. Revise o preview da importação
7. Clique em **Confirmar Importação**
8. Baixe a planilha de credenciais geradas (senhas temporárias)

### Configurar IoT (GroupLink)
1. Clique em **GroupLink (GL)** no menu lateral (grupo Cadastros)
2. Configure as credenciais de acesso ao S3 da GroupLink
3. Clique em **IOTs** → cadastre os dispositivos
4. Clique em **Medidores** → edite o medidor → informe o `glId` correspondente
5. A partir disso, os dados de consumo em tempo real aparecerão em **Monitoramento**

### Cadastrar reservatório
1. Clique em **Reservatórios** no menu lateral
2. Clique em **Novo**
3. Selecione o condomínio e dê um nome ao reservatório
4. Vincule ao dispositivo IoT correspondente

### Reset de senha de usuário
1. Clique em **Usuários** no menu lateral
2. Encontre o usuário desejado (use a busca)
3. Clique no botão **Reset** ao lado do usuário
4. O sistema gera uma nova senha temporária
5. O usuário recebe um email com a nova senha

### Processar apuração
1. Clique em **Apuração** no menu lateral
2. Selecione o condomínio e o período
3. O sistema processa as leituras e gera as filipetas
4. Após a geração, os emails são enfileirados automaticamente (EmailJob)
5. O cron job processa os emails a cada 10 minutos

---

## 7. Dicas e Atalhos

### Impressão de filipetas
- Use **Ctrl+P** (Windows) ou **Cmd+P** (Mac) em qualquer página de filipeta para imprimir ou salvar como PDF
- O sistema ajusta automaticamente o layout para impressão

### Filtros e busca
- Na maioria das telas, use os filtros no topo para refinar por condomínio, bloco, período
- A busca por texto filtra unidades em tempo real

### Problemas com cache (não atualiza)
- Se o sistema não mostrar atualizações recentes:
  1. Tente abrir em **aba anônima** para testar
  2. Se funcionar na anônima, limpe o cache do navegador
  3. No celular, feche e abra o app novamente

### Suporte técnico
- Clique em **Suporte** no menu lateral para abrir um chamado
- Ou envie email para **medicao@acquaxdobrasil.com.br**
- Telefone: **4003-7945**

---

## 8. Fluxo Resumo — Do cadastro à fatura

```
1. Cadastrar estrutura        → Empresa → Condomínio → Bloco → Apt → Medidor
2. Cadastrar usuários        → Importar planilha Excel ou criar individualmente
3. Registrar leituras        → Leituras → Nova leitura (ou importação em lote)
4. Registrar conta           → Contas → Informar conta da concessionária
5. Processar apuração        → Apuração → Selecionar condomínio e período → Processar
6. Filas geradas             → Filipetas são geradas automaticamente
7. Emails enviados           → Moradores recebem notificação por email
8. Morador consulta          → Acessa o sistema e vê a filipeta
```

---

*Documento gerado em julho de 2026. AcquaX do Brasil — medicao@acquaxdobrasil.com.br — 4003-7945*
