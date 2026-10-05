'use client';

/**
 * components/comunicado/ComunicadoSindico.tsx
 *
 * Comunicado oficial do sistema para o SÍNDICO.
 * Guia didático: painel do condomínio, filipeta e levantamento para
 * acompanhar o consumo, cadastro do e-mail pessoal para receber o
 * resumo mensal e a gestão de moradores/acessos.
 */

import React from 'react';
import {
  LayoutDashboard, FileText, TrendingUp, BarChart3, Bell, UserCog, Mail,
  HelpCircle, Droplets, ReceiptText, Users, Printer, ShieldCheck,
  MessageSquare, Lightbulb, Building2, Camera, CircleGauge, AlertTriangle,
  ClipboardList, Gauge,
} from 'lucide-react';
import {
  ComunicadoHero, ComunicadoIndex, Section, Callout, Steps,
  FeatureCard, InfoTable, ComunicadoFooter,
} from './comunicado-ui';

const INDEX = [
  { id: 'bem-vindo', label: 'Seu papel no sistema' },
  { id: 'dashboard', label: 'Início: panorama do condomínio' },
  { id: 'filipeta', label: 'Filipeta Medição: todas as unidades' },
  { id: 'levantamento', label: 'Levantamento: comparativo por período' },
  { id: 'leituras', label: 'Leituras e Contas da concessionária' },
  { id: 'alertas', label: 'Alertas, monitoramento e nível' },
  { id: 'moradores', label: 'Moradores e acessos (Usuários)' },
  { id: 'email', label: 'Cadastre seu e-mail pessoal' },
  { id: 'suporte', label: 'Suporte e sugestões' },
  { id: 'resumo', label: 'Resumo: onde está cada coisa' },
];

export default function ComunicadoSindico() {
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <ComunicadoHero
        accent="blue"
        audience="Para você, síndico(a)"
        title="Todo o consumo do seu condomínio, sob controle"
        subtitle="Este guia apresenta, passo a passo, as telas que você usa no dia a dia: o painel do condomínio, a filipeta de cada unidade, o levantamento comparativo por período, as leituras, as contas da concessionária, os alertas e a gestão de moradores. Também mostramos como cadastrar seu e-mail pessoal para receber o resumo mensal de consumo."
      />

      <ComunicadoIndex items={INDEX} />

      <Section
        id="bem-vindo"
        n={1}
        icon={Building2}
        title="Seu papel no sistema"
        intro={
          <>
            <p>
              Como <strong>síndico(a)</strong>, você tem uma visão completa do seu condomínio: pode acompanhar o consumo
              de todas as unidades, comparar blocos, conferir leituras e contas da concessionária e gerenciar os acessos
              dos moradores.
            </p>
            <p>As telas essenciais do seu menu são:</p>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={LayoutDashboard} title="Início" tag="Dashboard" href="/dashboard">
            Panorama do condomínio: consumo total, unidades em atenção e status das leituras.
          </FeatureCard>
          <FeatureCard icon={FileText} title="Filipeta Medição" tag="Todas as unidades" href="/meter-report">
            A filipeta de cada apartamento, com foto do medidor e valores.
          </FeatureCard>
          <FeatureCard icon={TrendingUp} title="Levantamento" tag="Comparativo" href="/levantamento">
            Tabela de todas as unidades × todos os meses, com tendência de consumo.
          </FeatureCard>
          <FeatureCard icon={Users} title="Usuários" tag="Acessos" href="/users">
            Cadastro e papéis dos moradores do condomínio.
          </FeatureCard>
        </div>
      </Section>

      <Section
        id="dashboard"
        n={2}
        icon={LayoutDashboard}
        title="Início (Dashboard): o panorama do condomínio"
        intro={<p>É a primeira tela após o login. Se você administra mais de um condomínio, aparece um seletor no topo para escolher qual visualizar.</p>}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 print:break-inside-avoid">
          <p className="font-semibold text-slate-800 text-sm mb-2">O que você acompanha aqui</p>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2"><FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> <span><strong>Filipetas</strong>: prévia das unidades do mês, com consumo e total.</span></li>
            <li className="flex gap-2"><TrendingUp className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" /> <span><strong>Resumo de Consumo</strong>: consumo total, valor arrecadado, unidades acima de 15 m³ e unidades sem consumo.</span></li>
            <li className="flex gap-2"><ReceiptText className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" /> <span><strong>Conta da Concessionária</strong>: valor total, data da leitura e consumo total do mês.</span></li>
            <li className="flex gap-2"><BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> <span><strong>Comparativo entre Blocos</strong>: qual bloco consome mais.</span></li>
            <li className="flex gap-2"><Gauge className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> <span><strong>Status das Leituras Automáticas</strong>: quando o condomínio usa IoT/GL, mostra há quantos dias chegou a última leitura.</span></li>
          </ul>
        </div>
        <Callout tone="tip" title="Comece o dia por aqui">
          Em poucos segundos o painel mostra o que está <strong>normal</strong> e o que <strong>precisa de atenção</strong> —
          unidades com consumo muito alto ou zerado, e eventuais atrasos nas leituras automáticas.
        </Callout>
      </Section>

      <Section
        id="filipeta"
        n={3}
        icon={FileText}
        title="Filipeta Medição: a conta individual de cada unidade"
        intro={
          <p>
            A <strong>Filipeta</strong> é o documento individual de cobrança de água de cada apartamento — equivalente a
            uma mini conta de água personalizada, com a <strong>foto do medidor</strong> como prova da leitura.
          </p>
        }
      >
        <p className="font-semibold text-slate-800 text-sm">Como consultar as filipetas do condomínio</p>
        <Steps items={[
          <>No menu, clique em <strong>Filipeta Medição</strong>.</>,
          <>Escolha o <strong>Mês de Referência</strong> e o <strong>Tipo de Medição</strong> (Água, Gás ou Energia).</>,
          <>Selecione o <strong>Condomínio</strong>. Se quiser, refine por <strong>Bloco</strong> e <strong>Apartamento</strong>.</>,
          <>Use a <strong>Busca</strong> para localizar rapidamente uma unidade pelo bloco ou número.</>,
          <>Para gerar o PDF, clique em <strong>Imprimir filipetas</strong> e escolha <em>Salvar como PDF</em>.</>,
        ]} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={Camera} title="Foto como prova" href="/meter-report">
            A imagem do mostrador fica visível em cada filipeta — é a evidência da leitura em caso de contestação.
          </FeatureCard>
          <FeatureCard icon={Droplets} title="Água, gás e energia" href="/meter-report">
            Alterne o tipo de medição para ver as filipetas correspondentes.
          </FeatureCard>
        </div>
        <Callout tone="warning" title="Antes de gerar as filipetas do mês">
          Confira se todas as unidades têm leitura e foto, e se a <strong>conta da concessionária do mês</strong> já foi
          registrada. Sem a conta, os valores aparecem zerados.
        </Callout>
      </Section>

      <Section
        id="levantamento"
        n={4}
        icon={TrendingUp}
        title="Levantamento: comparativo de consumo por período"
        intro={
          <p>
            O <strong>Levantamento</strong> é o relatório que compara <strong>vários meses</strong> de uma vez. É a ferramenta
            ideal para identificar unidades fora do padrão e acompanhar a evolução do condomínio.
          </p>
        }
      >
        <div className="rounded-xl border-2 border-teal-200 bg-teal-50/40 p-4 print:break-inside-avoid">
          <p className="font-semibold text-teal-900 text-sm mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> O Levantamento do síndico/administradora
          </p>
          <ul className="space-y-2 text-sm text-teal-900/90">
            <li className="flex gap-2"><CheckDot /> Você escolhe o <strong>período</strong> (De / Até) e o <strong>condomínio</strong>.</li>
            <li className="flex gap-2"><CheckDot /> Aparece uma <strong>tabela densa</strong>: todas as unidades × todos os meses.</li>
            <li className="flex gap-2"><CheckDot /> <strong>Setas de tendência</strong> (↑ / ↓) apontam o consumo fora do padrão.</li>
            <li className="flex gap-2"><CheckDot /> Clique em uma unidade para <strong>expandir</strong> e ver foto, leituras, consumo e valores de cada mês.</li>
            <li className="flex gap-2"><CheckDot /> KPIs no topo: unidades, meses, consumo médio/mês e consumo total.</li>
          </ul>
        </div>
        <p className="font-semibold text-slate-800 text-sm">Como usar</p>
        <Steps items={[
          <>No menu, clique em <strong>Levantamento</strong>.</>,
          <>Em <strong>De</strong> e <strong>Até</strong>, selecione o período desejado.</>,
          <>Escolha o <strong>Tipo</strong> (Água, Gás ou Energia) e o <strong>Condomínio</strong>.</>,
          <>Use <strong>Bloco</strong>, <strong>Apartamento</strong> e a <strong>Busca rápida</strong> para focar em um grupo.</>,
          <>Clique numa linha para ver os detalhes completos e use <strong>Imprimir / Exportar</strong> para salvar em PDF (A4 paisagem).</>,
        ]} />
        <Callout tone="tip" title="Uso prático na reunião de condomínio">
          Exporte o Levantamento em PDF e leve para a reunião: a tabela mostra, mês a mês, quem consumiu mais e quem
          teve variações — com a foto do medidor como respaldo.
        </Callout>
      </Section>

      <Section
        id="leituras"
        n={5}
        icon={CircleGauge}
        title="Leituras e Contas da concessionária"
        intro={<p>Estas duas abas são a base de tudo: sem leitura e sem conta, não há filipeta nem rateio.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={CircleGauge} title="Leituras" tag="Medições" href="/readings">
            Consulta e acompanhamento das leituras dos medidores das unidades, com foto e data.
          </FeatureCard>
          <FeatureCard icon={ReceiptText} title="Contas" tag="Concessionária" href="/dealership-readings">
            Registro da conta mensal de água (CESAN, SABESP, etc.): valor total, consumo e tarifa. É a base do rateio.
          </FeatureCard>
        </div>
        <Callout tone="info" title="Ciclo mensal recomendado">
          <ul className="space-y-1 mt-1">
            <li>1. Confira se todas as leituras do mês chegaram (Leituras).</li>
            <li>2. Registre a conta da concessionária do mês (Contas).</li>
            <li>3. Revise as filipetas (todas com foto? valores corretos?).</li>
            <li>4. Exporte em PDF e envie aos moradores.</li>
          </ul>
        </Callout>
      </Section>

      <Section
        id="alertas"
        n={6}
        icon={Bell}
        title="Alertas, monitoramento e nível das caixas"
        intro={<p>O sistema vigia o consumo e o abastecimento, e avisa quando algo foge do normal.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={Bell} title="Central de Alertas" href="/alerts">
            Unidades com consumo muito acima/abaixo da média, leituras regressivas e dias sem consumo.
          </FeatureCard>
          <FeatureCard icon={Gauge} title="Monitoramento" href="/monitoring">
            Acompanhamento em tempo real dos medidores com leitura automática (quando disponível).
          </FeatureCard>
          <FeatureCard icon={Droplets} title="Medidores de Nível" href="/reservoir-monitoring">
            Nível, temperatura e bateria das caixas d’água do condomínio.
          </FeatureCard>
          <FeatureCard icon={AlertTriangle} title="Unidades em atenção" href="/dashboard">
            No Início, veja as unidades acima de 15 m³ e as sem consumo do mês.
          </FeatureCard>
        </div>
        <Callout tone="warning" title="Sinal de alerta">
          Um consumo muito acima da média em uma unidade pode indicar <strong>vazamento</strong>. Use o Levantamento para
          confirmar a tendência e a filipeta (foto do medidor) para checar a leitura antes de acionar o morador.
        </Callout>
      </Section>

      <Section
        id="moradores"
        n={7}
        icon={Users}
        title="Moradores e acessos (aba Usuários)"
        intro={<p>Na aba <strong>Usuários</strong> você administra as pessoas vinculadas ao condomínio e o que cada uma pode ver.</p>}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 print:break-inside-avoid">
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" /> Cada pessoa aparece com o <strong>condomínio</strong>, bloco e unidade a que está vinculada.</li>
            <li className="flex gap-2"><Users className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" /> Você define os <strong>papéis</strong> (por exemplo, morador) e o escopo de acesso de cada usuário.</li>
            <li className="flex gap-2"><Mail className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" /> Confira se os <strong>e-mails</strong> dos moradores estão corretos — é por eles que chegam as comunicações.</li>
          </ul>
        </div>
        <Callout tone="tip" title="Bom para todos">
          Oriente os moradores a manterem o <strong>e-mail pessoal</strong> atualizado. Assim eles recebem as comunicações
          do sistema e o resumo do próprio consumo.
        </Callout>
      </Section>

      <Section
        id="email"
        n={8}
        icon={Mail}
        title="Cadastre seu e-mail pessoal e receba o resumo mensal"
        intro={
          <p>
            O sistema envia, <strong>todo mês</strong>, um <strong>resumo consolidado do consumo do condomínio</strong> —
            com consumo total, unidades em atenção, maiores e menores consumos e a variação em relação ao mês anterior.
            Para recebê-lo, seu <strong>e-mail pessoal</strong> precisa estar cadastrado.
          </p>
        }
      >
        <Callout tone="success" title="Leva menos de 1 minuto">
          Mantenha um e-mail que você realmente acessa. É por ele que você recebe o resumo mensal e as comunicações
          importantes do sistema.
        </Callout>
        <p className="font-semibold text-slate-800 text-sm">Como cadastrar ou atualizar seu e-mail</p>
        <Steps items={[
          <>No canto inferior do menu lateral, clique no seu <strong>nome</strong> (rodapé do menu).</>,
          <>Escolha <strong>Minha Conta</strong>.</>,
          <>No campo <strong>Email</strong>, digite o seu e-mail pessoal.</>,
          <>Se quiser, defina também uma nova senha nos campos de segurança.</>,
          <>Clique em <strong>Salvar</strong>.</>,
        ]} />
        <Callout tone="info" title="Prefere um caminho direto?">
          Acesse a sua conta pelo endereço <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">/account</code> dentro do sistema.
        </Callout>
      </Section>

      <Section
        id="suporte"
        n={9}
        icon={MessageSquare}
        title="Suporte e sugestões"
        intro={<p>Precisa de ajuda ou tem uma ideia para melhorar o sistema? Existem dois canais dentro do próprio AcquaX.</p>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard icon={MessageSquare} title="Suporte" href="/suporte">
            Abra e acompanhe atendimentos com a equipe. Você também pode <strong>iniciar uma conversa com uma unidade</strong>
            para tratar de um assunto específico (ex.: consumo fora do padrão).
          </FeatureCard>
          <FeatureCard icon={Lightbulb} title="Sugestões" href="/sugestoes">
            Envie ideias de melhoria para o sistema. A equipe acompanha e prioriza cada uma.
          </FeatureCard>
        </div>
      </Section>

      <Section
        id="resumo"
        n={10}
        icon={HelpCircle}
        title="Resumo: onde está cada coisa"
        intro={<p>Guarde esta tabela como um mapa rápido do sistema.</p>}
      >
        <InfoTable
          rows={[
            { what: 'Panorama do condomínio (consumo, atenção, leituras)', where: 'Início (Dashboard)' },
            { what: 'A filipeta de cada unidade, com foto do medidor', where: 'Filipeta Medição' },
            { what: 'Comparativo de todas as unidades por vários meses', where: 'Levantamento' },
            { what: 'Leituras dos medidores das unidades', where: 'Leituras' },
            { what: 'Conta mensal da concessionária (base do rateio)', where: 'Contas' },
            { what: 'Avisos de consumo fora do padrão', where: 'Central de Alertas' },
            { what: 'Nível das caixas d’água do condomínio', where: 'Medidores de Nível' },
            { what: 'Cadastro e papéis dos moradores', where: 'Usuários' },
            { what: 'Cadastrar/atualizar meu e-mail pessoal', where: 'Menu → seu nome → Minha Conta (ou /account)' },
            { what: 'Tirar dúvidas / iniciar conversa com uma unidade', where: 'Suporte' },
            { what: 'Enviar uma ideia de melhoria', where: 'Sugestões' },
          ]}
        />
        <Callout tone="tip" title="Atalhos que ajudam">
          <ul className="space-y-1 mt-1">
            <li className="flex gap-2"><Printer className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <strong>Imprimir / Exportar</strong> salva Filipeta e Levantamento em PDF.</li>
            <li className="flex gap-2"><ClipboardList className="w-3.5 h-3.5 mt-0.5 shrink-0" /> O Levantamento exporta em <strong>A4 paisagem</strong>, ideal para reuniões.</li>
            <li className="flex gap-2"><Droplets className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Sempre confirme o <strong>tipo</strong> escolhido: Água, Gás ou Energia.</li>
            <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Você vê apenas os condomínios sob sua responsabilidade.</li>
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
  return <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />;
}
