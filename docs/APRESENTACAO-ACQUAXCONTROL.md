# 📋 Apresentação do AcquaXControl

**AcquaXControl** é a plataforma web da AcquaX do Brasil para gestão completa de medição de água em condomínios. Permite cadastrar condomínios, registrar leituras de medidores, gerar faturas (filipetas), enviar notificações automáticas por email e monitorar consumo em tempo real via dispositivos IoT.

**Acesso:** [www.acquaxcontrol.com.br](https://www.acquaxcontrol.com.br)

---

## 🎯 O que o sistema resolve

- **Centralização:** Todas as leituras, faturas e relatórios de consumo em um único lugar
- **Automação:** Geração de filipetas e envio de emails automáticos para os moradores
- **Transparência:** O morador vê seu próprio consumo e histórico, sem precisar ligar na administradora
- **Monitoramento IoT:** Acompanhamento em tempo real de consumo, alertas e nível de reservatórios (para condomínios com medidores conectados)
- **Mobile:** Funciona no navegador do celular como um app (PWA instalável)

---

## 👥 Perfis de Usuário

O sistema adapta a tela inicial e as funcionalidades disponíveis conforme o perfil:

### 👨‍💻 Programador
Equipe técnica da AcquaX que configura e mantém o sistema.
- Cadastra novos clientes (empresa → condomínio → bloco → apartamento → medidor)
- Configura dispositivos IoT e vincula aos medidores
- Gerencia usuários, permissões e integrações
- Acesso total ao sistema sem restrições

### 👔 Administrador
Gestor interno da AcquaX com visão estratégica de toda a operação.
- Visualiza KPIs de todos os condomínios: pendências, alertas, consumo total
- Acompanha indicadores de performance
- Supervisiona todos os condomínios cadastrados
- Aprova configurações de tarifa

### 🏢 Administradora
Empresa que administra o condomínio (imobiliária, administradora).
- Vê apenas os condomínios que gerencia
- Acompanha consumo e faturamento dos condomínios da sua carteira
- Baixa relatórios e filipetas
- Aciona a AcquaX quando necessário

### 🔑 Síndico
O síndico do condomínio.
- Vê um painel exclusivo do seu condomínio
- Acompanha consumo por bloco e por unidade
- Verifica unidades com consumo anormal
- Consulta histórico de leituras
- Monitora status dos dispositivos IoT (se aplicável)

### 🏠 Morador
O morador da unidade.
- Vê o consumo anual da sua unidade em gráfico
- Consulta a fatura do mês atual (filipeta)
- Acompanha histórico dos últimos meses
- Recebe notificação por email com o resumo da fatura

---

## 🧱 Arquitetura de Informação

O sistema organiza os dados de forma hierárquica:

```
🏭 EMPRESA (ex: AcquaX Brasil Ltda.)
  └── 🏙️ CONDOMÍNIO (ex: Residencial Diamantina)
        └── 🧱 BLOCO (ex: Bloco A)
              └── 🚪 APARTAMENTO (ex: Apt 101)
                    └── 🔧 MEDIDOR (ex: Medidor 001)
                          └── 📡 IoT (ex: GroupLink)
```

---

## ⚙️ Funcionalidades por Módulo

### 📊 Módulo Geral (disponível para todos os perfis)

#### Início (Dashboard)
Tela inicial que se adapta ao perfil:
- **Morador:** Gráfico de consumo anual + preview das 3 últimas filipetas + valor a pagar
- **Síndico/Administradora:** Painel por condomínio com filipetas, resumo de consumo e conta da concessionária + status do IoT
- **Administrador:** KPIs globais (total de condomínios, pendências, alertas, consumo total)
- **Programador:** Atalhos rápidos para cadastros (Usuários, Condomínios, Blocos, Apartamentos, Medidores, Subir Leitura, Cadastrar Conta)

#### Relatórios
Gera relatórios de consumo por apartamento. Permite filtrar por condomínio, bloco e período.

#### Contas (Contas de Concessionária)
Registra as contas de água da concessionária (SABESP, etc.) por condomínio. Serve de base para o cálculo de rateio entre as unidades.

#### Leituras
Lista todas as leituras registradas no sistema. Permite cadastrar nova leitura manual, importar leituras em lote e ver detalhes de cada leitura (foto do medidor, valor, data).

#### Filipeta Medição
Gera a "filipeta" — o documento de faturamento individual de cada unidade. Contém:
- Dados do condomínio e unidade
- Foto do medidor
- Leitura atual e anterior
- Consumo do mês (m³)
- Histórico de consumo (6 meses)
- Valor a pagar

#### Levantamento de Consumo
Análise visual do consumo por unidade e por mês. Exibe:
- Gráfico de consumo médio
- Cards de foto do medidor por mês
- Tabela de detalhamento por unidade
- Comparação de consumo entre meses

#### Monitoramento IoT *(somente para condomínios com GroupLink)*
Painel em tempo real com:
- Consumo atual de cada medidor conectado
- Gráfico de consumo por hora/dia/mês
- Status de conectividade dos dispositivos

#### Central de Alertas *(somente para condomínios com GroupLink)*
Lista de alertas gerados pelos dispositivos IoT:
- Consumo anormal (pico fora do padrão)
- Vazamento detectado
- Dispositivo offline
- Nível crítico de reservatório

#### Medidores de Nível *(somente para condomínios com GroupLink)*
Monitoramento do nível de reservatórios de água em tempo real, com gráficos de histórico.

#### Guia de Uso
Manual interativo dentro do sistema, com explicação de cada tela e fluxo de uso.

#### Suporte
Formulário de abertura de chamados técnicos diretamente pelo sistema.

#### Sugestões
Formulário para envio de sugestões de melhoria.

---

### 🏗️ Módulo Cadastros (somente Administrador, Programador e Síndico com permissão)

#### Administradoras
Cadastro de empresas administradoras.

#### Condomínios
Cadastro e edição de condomínios: nome, endereço, tipo (horizontal/vertical), vínculo com administradora.

#### Blocos
Cadastro de blocos dentro de cada condomínio.

#### Apartamentos
Cadastro de unidades (apartamentos) dentro de cada bloco.

#### Medidores
Cadastro de medidores de água. Cada medidor é vinculado a um apartamento e pode ter um ID de IoT (GroupLink).

#### IOTs
Cadastro e configuração de dispositivos IoT conectados aos medidores.

#### GroupLink (GL)
Configuração da integração com o sistema GroupLink para monitoramento em tempo real.

#### Reservatórios
Cadastro de reservatórios de água para monitoramento de nível.

#### Usuários
Cadastro e gerenciamento de usuários. Inclui:
- Criação individual de usuários
- **Importação em lote via planilha Excel** (Bloco, Apartamento, Nome, Email)
- Geração automática de senhas temporárias
- Envio de email de boas-vindas
- Reset de senha em lote
- Atribuição de papéis (Administrador, Programador, Síndico, Morador)

#### Papéis
Configuração de papéis e permissões por entidade (sistema, empresa, condomínio, bloco, apartamento).

#### Apuração
Módulo de apuração de faturamento: processa as leituras e gera as filipetas com os valores calculados.

---

### 🔗 Módulo Integrações

#### API
Gerenciamento de chaves de API para integração com sistemas externos. Permite gerar, visualizar e revogar chaves de acesso.

---

## 📱 App Móvel (PWA)

O AcquaXControl é uma **PWA (Progressive Web App)** — funciona no navegador mas pode ser instalado no celular como um aplicativo nativo:

- **Android:** Abra o site no Chrome → menu (⋮) → "Instalar aplicativo"
- **iOS:** Abra o site no Safari → botão Compartilar → "Adicionar à Tela de Início"
- Funciona offline (página de fallback)
- Notificações push (em desenvolvimento)
- Ícone e tela de splash personalizados

---

## 📧 Notificações por Email

O sistema envia automaticamente emails para os moradores quando uma nova filipeta é gerada:
- Resumo da fatura (consumo, valor, período)
- Link para visualizar a filipeta completa no sistema
- Comparativo com o consumo do mês anterior e média dos últimos 6 meses
- Processamento em lotes via fila de EmailJobs para não sobrecarregar o servidor

---

## 🔒 Segurança e Privacidade

- Autenticação por sessão (cookie seguro SameSite=Lax)
- Permissões granulares por entidade (cada usuário só vê o que tem permissão)
- Row-Level Security: moradores só veem seus próprios dados
- Soft-delete: dados não são apagados fisicamente, preservando histórico
- LGPD: análise de consumo compara apenas com os próprios dados históricos da unidade

---

## 📈 Próximos Passos e Melhorias Futuras

- Publicação nas lojas (Google Play e App Store) via TWA/Capacitor
- Notificações push para alertas de consumo
- Tradução de unidades de medida (m³ → litros) para moradores
- Dashboard comparativo entre condomínios
- Integração com sistemas de pagamento para boletos
