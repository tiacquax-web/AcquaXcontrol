'use client';

/**
 * components/comunicado/ComunicadoMorador.tsx
 *
 * Comunicado oficial do sistema para o MORADOR.
 * Guia didático: onde ver cada informação, como acompanhar o consumo
 * (Filipeta e Levantamento) e como cadastrar o e-mail pessoal.
 */

import React from 'react';
import {
  Home, FileText, TrendingUp, BarChart3, Bell, UserCog, Mail, HelpCircle,
  Droplets, Flame, GaugeCircle, Camera, Printer, Smartphone, ShieldCheck,
  MessageSquare, Lightbulb,
} from 'lucide-react';
import {
  ComunicadoHero, ComunicadoIndex, Section, Callout, Steps,
  FeatureCard, InfoTable, ComunicadoFooter,
} from './comunicado-ui';

const INDEX = [
  { id: 'bem-vindo', label: 'Bem-vindo ao seu painel' },
  { id: 'dashboard', label: 'Início: seu consumo em 1 olhada' },
  { id: 'filipeta', label: 'Filipeta Medição: a sua conta' },
  { id: 'levantamento', label: 'Levantamento: histórico completo' },
  { id: 'relatorios', label: 'Relatórios de apartamento' },
  { id: 'alertas', label: 'Alertas e monitoramento' },
  { id: 'email', label: 'Cadastre seu e-mail pessoal' },
  { id: 'suporte', label: 'Suporte e sugestões' },
  { id: 'resumo', label: 'Resumo: onde está cada coisa' },
];

export default function ComunicadoMorador() {
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <ComunicadoHero
        audience="Para você, morador(a)"
        title="Seu consumo de água, gás e energia na palma da mão"
        subtitle="Este guia mostra, passo a passo, onde consultar sua filipeta, acompanhar seu histórico de consumo mês a mês e cadastrar seu e-mail pessoal para receber o resumo mensal. Não é preciso conhecimento técnico — é só seguir os caminhos indicados."
      />

      <ComunicadoIndex items={INDEX} />

      <Section
        id="bem-vindo"
        n={1}
        icon={Home}
        title="Bem-vindo ao seu painel"
        intro={
          <>
            <p>
              O <strong>AcquaX Control</strong> é o sistema que mede e organiza o consumo das unidades do seu condomínio.
              Como morador, você tem acesso somente às informações da <strong>sua unidade</strong> — tudo com privacidade
              e segurança.
            </p>
            <p>O menu lateral é o seu mapa. Os itens mais importantes para você são:</p>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={BarChart3} title="Início" tag="Dashboard" href="/dashboard">
            Seu consumo do mês e o valor estimado, em destaque.
          </FeatureCard>
          <FeatureCard icon={FileText} title="Filipeta Medição" tag="Conta" href="/meter-report">
            A sua “conta de água” individual, com foto do medidor e valor a pagar.
          </FeatureCard>
          <FeatureCard icon={TrendingUp} title="Levantamento" tag="Histórico" href="/levantamento">
            Todos os meses lado a lado, com foto do medidor e gráfico de evolução.
          </FeatureCard>
          <FeatureCard icon={Bell} title="Central de Alertas" tag="Avisos" href="/alerts">
            Avisos de consumo fora do padrão ou leitura suspeita.
          </FeatureCard>
        </div>
      </Section>

      <Section
        id="dashboard"
        n={2}
        icon={BarChart3}
        title="Início (Dashboard): seu consumo em 1 olhada"
        intro={<p>Ao entrar no sistema, a primeira tela é o <strong>Início</strong>. Ela foi feita para você entender tudo em poucos segundos.</p>}
      >
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 print:break-inside-avoid">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-2">O que aparece nessa tela</p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2"><Droplets className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" /> <span><strong>Card “Meu Consumo”</strong>: consumo do mês, valor individual, área comum e total da unidade.</span></li>
            <li className="flex gap-2"><BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> <span><strong>Gráfico de Consumo Anual</strong>: barras com o consumo de cada mês do ano (o mês de maior consumo fica destacado).</span></li>
            <li className="flex gap-2"><TrendingUp className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" /> <span><strong>Minha Área Comum</strong>: quanto a sua unidade pagou de área comum (em R$) ao longo do ano.</span></li>
          </ul>
        </div>
        <Callout tone="tip" title="Água, gás e energia">
          Use os botões <strong>Água</strong>, <strong>Gás</strong> e <strong>Energia</strong> no topo para alternar entre os tipos
          de medição. As cores ajudam: azul = água, laranja = gás, amarelo = energia.
        </Callout>
        <Callout tone="info" title="Tem mais de uma unidade?">
          Se a sua conta estiver ligada a mais de um apartamento, aparecem botões no topo para escolher a unidade que
          deseja acompanhar.
        </Callout>
      </Section>

      <Section
        id="filipeta"
        n={3}
        icon={FileText}
        title="Filipeta Medição: a sua conta individual"
        intro={
          <p>
            A <strong>Filipeta</strong> é o documento mais importante para você. É a sua “conta de água” individual,
            gerada por apartamento — o equivalente a uma conta de concessionária, mas personalizada para a sua unidade.
          </p>
        }
      >
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 print:break-inside-avoid">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-teal-500" /> O que contém a sua filipeta
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
              <p className="font-medium text-slate-700 dark:text-slate-200">📷 Foto do medidor</p>
              <p className="text-xs mt-1">A prova visual da leitura, com os números do mostrador.</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
              <p className="font-medium text-slate-700 dark:text-slate-200">📈 Leituras e consumo</p>
              <p className="text-xs mt-1">Leitura anterior, leitura atual e o consumo do período.</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
              <p className="font-medium text-slate-700 dark:text-slate-200">💰 Valores</p>
              <p className="text-xs mt-1">Água/esgoto, área comum e o total a pagar.</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
              <p className="font-medium text-slate-700 dark:text-slate-200">📅 Período e próxima leitura</p>
              <p className="text-xs mt-1">De quando até quando a leitura vale e quando será a próxima.</p>
            </div>
          </div>
        </div>

        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Como consultar a sua filipeta</p>
        <Steps items={[
          <>No menu lateral, clique em <strong>Filipeta Medição</strong>.</>,
          <>Escolha o <strong>Mês de Referência</strong> desejado (por padrão, o mês atual).</>,
          <>Selecione o <strong>Tipo de Medição</strong>: Água, Gás ou Energia.</>,
          <>A sua unidade já vem selecionada automaticamente. A filipeta aparece em um cartão com a foto do medidor.</>,
          <>Para guardar ou enviar, clique em <strong>Imprimir filipetas</strong> e escolha <em>Salvar como PDF</em>.</>,
        ]} />
        <Callout tone="info" title="Por que a foto importa">
          A foto do mostrador é a <strong>prova da leitura</strong>. Se em algum momento você tiver dúvida sobre o valor,
          ela mostra exatamente o número registrado no seu medidor. A imagem é exibida inteira (sem cortes) para que os
          números fiquem sempre legíveis.
        </Callout>
      </Section>

      <Section
        id="levantamento"
        n={4}
        icon={TrendingUp}
        title="Levantamento: seu histórico completo mês a mês"
        intro={
          <p>
            Enquanto a Filipeta mostra <strong>um mês</strong>, o <strong>Levantamento</strong> mostra <strong>vários meses
            lado a lado</strong> — perfeito para perceber se o seu consumo está subindo, caindo ou estável.
          </p>
        }
      >
        <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/30 p-4 print:break-inside-avoid">
          <p className="font-semibold text-sky-900 dark:text-sky-100 text-sm mb-2 flex items-center gap-2">
            <Home className="w-4 h-4" /> O Levantamento do morador é feito sob medida para você
          </p>
          <ul className="space-y-2 text-sm text-sky-900 dark:text-sky-100/90">
            <li className="flex gap-2"><CheckDot /> Você vê <strong>automaticamente apenas a sua unidade</strong> — nada de telas complicadas.</li>
            <li className="flex gap-2"><CheckDot /> Cada mês aparece como um <strong>cartão com a foto do medidor em destaque</strong>, com leituras, consumo e valores.</li>
            <li className="flex gap-2"><CheckDot /> Um <strong>gráfico de evolução</strong> mostra a sua média e a linha de tendência do consumo.</li>
            <li className="flex gap-2"><CheckDot /> Você pode <strong>imprimir o histórico completo</strong> para guardar.</li>
          </ul>
        </div>

        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Como usar</p>
        <Steps items={[
          <>No menu, clique em <strong>Levantamento</strong>.</>,
          <>Em <strong>De</strong> e <strong>Até</strong>, escolha o período (ex.: últimos 6 meses).</>,
          <>Escolha o <strong>Tipo</strong> (Água, Gás ou Energia).</>,
          <>Pronto: os cartões de cada mês e o gráfico aparecem na tela. Use <strong>Imprimir / Exportar</strong> para salvar em PDF.</>,
        ]} />
        <Callout tone="tip" title="Dica de leitura do gráfico">
          A linha tracejada é a sua <strong>média</strong>. Se um mês ficar bem acima dela, vale investigar (um vazamento,
          uma visita mais longa, etc.). É justamente para isso que o Levantamento existe.
        </Callout>
      </Section>

      <Section
        id="relatorios"
        n={5}
        icon={BarChart3}
        title="Relatórios de apartamento"
        intro={<p>Na aba <strong>Relatórios</strong> você encontra os relatórios de consumo já fechados da sua unidade, organizados por condomínio, bloco e apartamento.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={FileText} title="Relatórios fechados" href="/apartment-report">
            Documentos de consumo já processados, com filtro por período.
          </FeatureCard>
          <FeatureCard icon={GaugeCircle} title="Água, gás e energia" href="/apartment-report">
            Filtre por tipo de medição para achar o relatório certo.
          </FeatureCard>
        </div>
        <Callout tone="info">
          Se a sua unidade tiver mais de um apartamento, você escolhe qual quer consultar. Com um único apartamento,
          ele já vem selecionado.
        </Callout>
      </Section>

      <Section
        id="alertas"
        n={6}
        icon={Bell}
        title="Alertas e monitoramento"
        intro={<p>O sistema vigia o seu consumo e avisa quando algo foge do normal.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={Bell} title="Central de Alertas" href="/alerts">
            Consumo muito acima ou abaixo da média, leituras regressivas e dias sem consumo.
          </FeatureCard>
          <FeatureCard icon={Droplets} title="Medidores de Nível" href="/reservoir-monitoring">
            Acompanha o nível das caixas d’água do condomínio (quando disponível).
          </FeatureCard>
        </div>
        <Callout tone="warning" title="Recebeu um alerta de consumo alto?">
          Antes de se preocupar, confira a foto do medidor na Filipeta. Pequenas variações são normais — mas um salto
          grande pode indicar vazamento. Nesse caso, abra um atendimento na aba <strong>Suporte</strong>.
        </Callout>
      </Section>

      <Section
        id="email"
        n={7}
        icon={Mail}
        title="Cadastre seu e-mail pessoal e receba o resumo do consumo"
        intro={
          <p>
            Para receber os avisos e o <strong>resumo do seu consumo mensal</strong> por e-mail, é essencial que o seu
            <strong> e-mail pessoal</strong> esteja cadastrado corretamente no sistema.
          </p>
        }
      >
        <Callout tone="success" title="É rápido e leva menos de 1 minuto">
          Mantenha um e-mail que você realmente acessa. É por ele que você vai receber as comunicações e o resumo
          mensal do seu consumo.
        </Callout>
        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Como cadastrar ou atualizar seu e-mail</p>
        <Steps items={[
          <>No canto inferior do menu lateral, clique no seu <strong>nome</strong> (rodapé do menu).</>,
          <>Escolha <strong>Minha Conta</strong>.</>,
          <>No campo <strong>Email</strong>, digite o seu e-mail pessoal.</>,
          <>Se quiser, defina também uma nova senha nos campos de segurança.</>,
          <>Clique em <strong>Salvar</strong>. Pronto — a partir daí, você entra com esse e-mail e recebe as comunicações nele.</>,
        ]} />
        <Callout tone="info" title="Prefere um caminho direto?">
          Você também pode acessar a sua conta pelo endereço <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">/account</code> dentro do sistema.
        </Callout>
      </Section>

      <Section
        id="suporte"
        n={8}
        icon={MessageSquare}
        title="Suporte e sugestões"
        intro={<p>Precisa de ajuda ou tem uma ideia para melhorar o sistema? Existem dois canais dentro do próprio AcquaX.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={MessageSquare} title="Suporte" href="/suporte">
            Abra um atendimento para tirar dúvidas sobre a sua filipeta, leitura ou valores. Você acompanha a conversa
            e é avisado quando a equipe responder.
          </FeatureCard>
          <FeatureCard icon={Lightbulb} title="Sugestões" href="/sugestoes">
            Envie ideias de melhoria. Outras pessoas podem votar e a equipe acompanha cada uma.
          </FeatureCard>
        </div>
      </Section>

      <Section
        id="resumo"
        n={9}
        icon={HelpCircle}
        title="Resumo: onde está cada coisa"
        intro={<p>Guarde esta tabela como um mapa rápido do sistema.</p>}
      >
        <InfoTable
          rows={[
            { what: 'Quanto consumi e quanto vou pagar neste mês', where: 'Início (Dashboard) → card “Meu Consumo”' },
            { what: 'A minha conta individual com foto do medidor', where: 'Filipeta Medição' },
            { what: 'Meu histórico de vários meses com gráfico', where: 'Levantamento' },
            { what: 'Relatórios de consumo já fechados da unidade', where: 'Relatórios' },
            { what: 'Avisos de consumo fora do padrão', where: 'Central de Alertas' },
            { what: 'Nível das caixas d’água do condomínio', where: 'Medidores de Nível' },
            { what: 'Cadastrar/atualizar meu e-mail pessoal', where: 'Menu → seu nome → Minha Conta (ou /account)' },
            { what: 'Tirar dúvidas com a equipe', where: 'Suporte' },
            { what: 'Enviar uma ideia de melhoria', where: 'Sugestões' },
          ]}
        />
        <Callout tone="tip" title="Atalhos que ajudam">
          <ul className="space-y-1 mt-1">
            <li className="flex gap-2"><Printer className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Botão <strong>Imprimir / Exportar</strong> salva qualquer tela em PDF.</li>
            <li className="flex gap-2"><Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Todas as telas do morador funcionam bem no celular.</li>
            <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Você vê apenas os dados da sua própria unidade.</li>
            <li className="flex gap-2"><Flame className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Não se esqueça de escolher o tipo certo: Água, Gás ou Energia.</li>
          </ul>
        </Callout>
      </Section>

      <ComunicadoFooter
        contacts={[
          { label: 'E-mail', value: 'medicao@acquaxdobrasil.com.br' },
          { label: 'Telefone', value: '4003-7945' },
          { label: 'Dentro do sistema', value: 'aba Suporte' },
        ]}
      />
    </article>
  );
}

function CheckDot() {
  return <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />;
}
