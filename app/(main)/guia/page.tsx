"use client"

import React, { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BookOpen, Users, LayoutDashboard, FileText, TrendingUp,
  CircleGauge, Radio, Droplets, ReceiptText, Palette,
  CheckSquare, Map, BookMarked, ChevronRight, ChevronDown,
  Lightbulb, AlertTriangle, CheckCircle2, XCircle, Zap,
  Star, Target, Eye, Smartphone, Printer, Camera,
  ArrowRight, Info, Settings, Building2, Home, User,
  Shield, Code2, Building
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Chapter {
  id: string
  title: string
  part: string
  icon: React.ElementType
  color: string
}

// ─── Chapter list ─────────────────────────────────────────────────────────────
const chapters: Chapter[] = [
  { id: "intro",      title: "O que é o AcquaX?",            part: "Parte 1 — Entendendo o Sistema", icon: BookOpen,       color: "teal"   },
  { id: "perfis",     title: "Os 5 Perfis de Usuário",        part: "Parte 1 — Entendendo o Sistema", icon: Users,          color: "blue"   },
  { id: "arquitetura",title: "Arquitetura de Informação",     part: "Parte 1 — Entendendo o Sistema", icon: Building2,      color: "purple" },
  { id: "dashboard",  title: "Tela Inicial (Dashboard)",      part: "Parte 2 — Guia de Cada Tela",    icon: LayoutDashboard,color: "indigo" },
  { id: "filipeta",   title: "Filipeta de Medição",           part: "Parte 2 — Guia de Cada Tela",    icon: FileText,       color: "green"  },
  { id: "levantamento",title:"Levantamento",                  part: "Parte 2 — Guia de Cada Tela",    icon: TrendingUp,     color: "teal"   },
  { id: "leituras",   title: "Leituras",                      part: "Parte 2 — Guia de Cada Tela",    icon: CircleGauge,    color: "orange" },
  { id: "iot",        title: "Dispositivos IoT",              part: "Parte 2 — Guia de Cada Tela",    icon: Radio,          color: "pink"   },
  { id: "reservatorio",title:"Monitoramento de Reservatórios",part: "Parte 2 — Guia de Cada Tela",    icon: Droplets,       color: "cyan"   },
  { id: "contas",     title: "Contas de Concessionária",      part: "Parte 2 — Guia de Cada Tela",    icon: ReceiptText,    color: "yellow" },
  { id: "design",     title: "Cores e Identidade Visual",     part: "Parte 3 — Design",               icon: Palette,        color: "violet" },
  { id: "principios", title: "Princípios de Design",          part: "Parte 3 — Design",               icon: Star,           color: "amber"  },
  { id: "fluxos",     title: "Fluxos Críticos de Uso",        part: "Parte 3 — Design",               icon: Map,            color: "rose"   },
  { id: "qualidade",  title: "Guia de Qualidade",             part: "Parte 4 — Qualidade",            icon: CheckSquare,    color: "emerald"},
  { id: "melhorias",  title: "Roadmap de Melhorias",          part: "Parte 5 — Futuro",               icon: Zap,            color: "fuchsia"},
  { id: "glossario",  title: "Glossário",                     part: "Parte 6 — Glossário",            icon: BookMarked,     color: "slate"  },
]

const colorMap: Record<string, string> = {
  teal:    "bg-teal-100 text-teal-800 border-teal-200",
  blue:    "bg-blue-100 text-blue-800 border-blue-200",
  purple:  "bg-purple-100 text-purple-800 border-purple-200",
  indigo:  "bg-indigo-100 text-indigo-800 border-indigo-200",
  green:   "bg-green-100 text-green-800 border-green-200",
  orange:  "bg-orange-100 text-orange-800 border-orange-200",
  pink:    "bg-pink-100 text-pink-800 border-pink-200",
  cyan:    "bg-cyan-100 text-cyan-800 border-cyan-200",
  yellow:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  violet:  "bg-violet-100 text-violet-800 border-violet-200",
  amber:   "bg-amber-100 text-amber-800 border-amber-200",
  rose:    "bg-rose-100 text-rose-800 border-rose-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  fuchsia: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  slate:   "bg-slate-100 text-slate-800 border-slate-200",
}

const dotMap: Record<string, string> = {
  teal: "bg-teal-500", blue: "bg-blue-500", purple: "bg-purple-500",
  indigo: "bg-indigo-500", green: "bg-green-500", orange: "bg-orange-500",
  pink: "bg-pink-500", cyan: "bg-cyan-500", yellow: "bg-yellow-500",
  violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500",
  emerald: "bg-emerald-500", fuchsia: "bg-fuchsia-500", slate: "bg-slate-500",
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4 flex items-center gap-2">{children}</h2>
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-700 mt-5 mb-2">{children}</h3>
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 my-3 text-sm text-blue-800">
      <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
      <span>{children}</span>
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-yellow-50 border border-yellow-100 rounded-lg p-3 my-3 text-sm text-yellow-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-500" />
      <span>{children}</span>
    </div>
  )
}

function Good({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start text-sm text-green-800 my-1">
      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
      <span>{children}</span>
    </div>
  )
}

function Bad({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start text-sm text-red-700 my-1">
      <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
      <span>{children}</span>
    </div>
  )
}

function FlowStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 my-2">
      <div className="shrink-0 w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
        {n}
      </div>
      <p className="text-sm text-slate-700 pt-1">{children}</p>
    </div>
  )
}

// ─── Profile card ─────────────────────────────────────────────────────────────
function ProfileCard({
  emoji, title, color, who, sees, tasks,
}: {
  emoji: string; title: string; color: string
  who: string; sees: string[]; tasks: string[]
}) {
  return (
    <Card className={`border-2 ${color} rounded-xl`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <p className="text-slate-600"><strong>Quem é:</strong> {who}</p>
        <div>
          <p className="font-medium text-slate-700 mb-1">O que vê ao entrar:</p>
          <ul className="space-y-1">
            {sees.map((s, i) => <li key={i} className="flex items-start gap-1 text-slate-600"><ArrowRight size={12} className="mt-1 shrink-0 text-teal-500" />{s}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-700 mb-1">Responsabilidades:</p>
          <ul className="space-y-1">
            {tasks.map((t, i) => <li key={i} className="flex items-start gap-1 text-slate-600"><CheckCircle2 size={12} className="mt-1 shrink-0 text-green-500" />{t}</li>)}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Chapters content ─────────────────────────────────────────────────────────
const CHAPTER_CONTENT: Record<string, React.ReactNode> = {

  intro: (
    <div>
      <p className="text-slate-600 mb-4">
        O <strong>AcquaX Field</strong> é um sistema de gestão de consumo de água para condomínios.
        Ele conecta três pontos principais:
      </p>
      <div className="bg-slate-50 border rounded-xl p-4 font-mono text-sm text-slate-700 space-y-1 my-4">
        <p>📟 <strong>Medidor físico</strong> instalado no apartamento</p>
        <p className="pl-4 text-teal-600">↓ envia leitura via IoT (automático) ou leiturista (manual)</p>
        <p>🖥️ <strong>Sistema AcquaX</strong> — processa, calcula, exibe</p>
        <p className="pl-4 text-teal-600">↓ gera relatório e filipeta</p>
        <p>🏠 <strong>Morador</strong> recebe a filipeta com sua fatura</p>
      </div>
      <SectionTitle><Target size={18} />O que o sistema faz na prática</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { icon: "📖", t: "Registra leituras", d: "Manual por leituristas ou automático via sensores IoT" },
          { icon: "📊", t: "Calcula consumo", d: "Leitura atual menos leitura anterior = m³ consumidos" },
          { icon: "💰", t: "Apura valores", d: "Água/esgoto individual + rateio de área comum" },
          { icon: "📄", t: "Gera a filipeta", d: "Documento com foto do medidor e valor a pagar" },
          { icon: "🔔", t: "Monitora em tempo real", d: "Nível das caixas d'água e alertas de consumo anormal" },
        ].map(({ icon, t, d }) => (
          <div key={t} className="flex gap-3 bg-white border rounded-lg p-3">
            <span className="text-2xl">{icon}</span>
            <div><p className="font-semibold text-sm text-slate-800">{t}</p><p className="text-xs text-slate-500">{d}</p></div>
          </div>
        ))}
      </div>
    </div>
  ),

  perfis: (
    <div>
      <p className="text-slate-600 mb-5">O sistema tem <strong>5 tipos de usuário</strong>, cada um com uma visão diferente.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfileCard
          emoji="👨‍💻" title="Programador" color="border-slate-300"
          who="Equipe técnica da AcquaX que configura e mantém o sistema."
          sees={["Atalhos para cadastrar condomínios, blocos, apartamentos", "Acesso total ao sistema sem restrições"]}
          tasks={["Cadastrar novos clientes (empresa → condomínio → bloco → apto → medidor)", "Configurar IoT e vincular aos medidores", "Gerenciar usuários e permissões"]}
        />
        <ProfileCard
          emoji="👔" title="Administrador" color="border-blue-300"
          who="Gestor interno da AcquaX. Visão estratégica de toda a operação."
          sees={["KPIs de todos os condomínios: pendências, alertas, consumo total", "Resumo financeiro da operação"]}
          tasks={["Supervisionar todos os condomínios", "Acompanhar indicadores de performance", "Aprovar configurações de tarifa"]}
        />
        <ProfileCard
          emoji="🏢" title="Administradora" color="border-green-300"
          who="Empresa que administra o condomínio (imobiliária, administradora)."
          sees={["Lista dos condomínios que gerencia", "Dados de consumo e faturamento dos seus condomínios"]}
          tasks={["Acompanhar consumo dos condomínios da carteira", "Baixar relatórios e filipetas", "Acionar a AcquaX quando necessário"]}
        />
        <ProfileCard
          emoji="🔑" title="Síndico" color="border-teal-300"
          who="O síndico do condomínio."
          sees={["Painel exclusivo do seu condomínio", "Consumo por bloco e por unidade", "Alertas de consumo fora do padrão"]}
          tasks={["Acompanhar consumo do condomínio", "Verificar unidades com consumo anormal", "Consultar histórico de leituras"]}
        />
        <ProfileCard
          emoji="🏠" title="Morador" color="border-sky-300"
          who="O morador da unidade."
          sees={["Consumo anual da sua unidade (gráfico)", "Fatura do mês atual", "Histórico dos últimos meses"]}
          tasks={["Consultar o próprio consumo", "Ver a filipeta do mês", "Acompanhar histórico no levantamento"]}
        />
      </div>
    </div>
  ),

  arquitetura: (
    <div>
      <p className="text-slate-600 mb-4">Como o sistema está organizado hierarquicamente:</p>
      <div className="bg-slate-900 text-green-300 rounded-xl p-5 font-mono text-sm space-y-1 mb-5">
        <p className="text-yellow-300 font-bold">🏭 EMPRESA (ex: AcquaX Brasil Ltda.)</p>
        <p className="pl-4 text-white">└── 🏙️ CONDOMÍNIO (ex: Residencial Diamantina)</p>
        <p className="pl-10 text-white">└── 🧱 BLOCO (ex: Bloco A)</p>
        <p className="pl-16 text-white">└── 🚪 APARTAMENTO (ex: Apt 101)</p>
        <p className="pl-24 text-white">└── 📟 MEDIDOR (ex: Chassi B24A0019474D)</p>
        <p className="pl-32 text-green-300">└── 📊 LEITURAS (ex: 457,862 m³)</p>
        <p className="pl-40 text-cyan-300">└── 📄 FILIPETA (gerada ao final do mês)</p>
      </div>
      <Tip>
        Toda tela do sistema respeita essa hierarquia. Quando você está numa tela de apartamento,
        sempre aparece em qual bloco e condomínio você está — para nunca cadastrar dados no lugar errado.
      </Tip>
      <SectionTitle><Info size={18} />Por que isso importa</SectionTitle>
      <p className="text-sm text-slate-600">
        O erro mais comum em sistemas de gestão de condomínio é o usuário se perder na hierarquia
        e cadastrar uma leitura no apartamento errado ou no condomínio errado. A hierarquia visível
        em todo momento resolve esse problema.
      </p>
    </div>
  ),

  dashboard: (
    <div>
      <p className="text-slate-600 mb-5">A primeira tela após o login. <strong>Muda completamente dependendo do perfil.</strong></p>
      {[
        {
          icon: "🏠", role: "Morador", goal: "Ver em 5 segundos quanto consumiu e quanto vai pagar.",
          items: ["Gráfico de barras com consumo dos últimos 12 meses (m³)", "Card destacado com o mês atual: consumo + valor estimado", "Botão direto para a filipeta"],
          tip: "Princípio aplicado: Zero cliques para a informação principal — a resposta está na tela inicial.",
          warning: "Moradores que nunca usaram sistema web não sabem o que é m³. Melhoria futura: traduzir para linguagem cotidiana."
        },
        {
          icon: "🔑", role: "Síndico / Administradora", goal: "Visão panorâmica do condomínio — o que está normal, o que precisa de atenção.",
          items: ["KPIs: total de unidades, leituras do mês, consumo total, variação vs. mês anterior", "Lista de unidades com consumo fora do padrão (alertas)", "Gráfico de evolução do condomínio"],
        },
        {
          icon: "👔", role: "Administrador", goal: "Gestão completa — todos os condomínios de uma vez.",
          items: ["KPIs consolidados: condomínios, leituras pendentes, alertas", "Visão por condomínio: % de leituras concluídas no mês", "Mapa de calor de consumo (quando disponível)"],
        },
        {
          icon: "👨‍💻", role: "Programador", goal: "Acesso rápido aos cadastros — o programador configura, não gerencia.",
          items: ["Atalhos: 'Novo Condomínio', 'Novo Bloco', 'Novo Apartamento', 'Novo Medidor'", "Últimas atividades do sistema", "Alertas técnicos (dispositivos offline, erros de importação)"],
        },
      ].map(({ icon, role, goal, items, tip, warning }) => (
        <Card key={role} className="mb-4 rounded-xl border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-xl">{icon}</span> Dashboard do {role}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-slate-600"><strong>Objetivo:</strong> {goal}</p>
            <ul className="space-y-1">
              {items.map((item, i) => <li key={i} className="flex items-start gap-1 text-slate-600"><ChevronRight size={13} className="mt-0.5 shrink-0 text-teal-500" />{item}</li>)}
            </ul>
            {tip && <Tip>{tip}</Tip>}
            {warning && <Warning>{warning}</Warning>}
          </CardContent>
        </Card>
      ))}
    </div>
  ),

  filipeta: (
    <div>
      <p className="text-slate-600 mb-4">
        O documento mais importante do sistema. É o que vai para o morador —
        equivalente à conta de água, mas <strong>individual por apartamento</strong>.
      </p>
      <div className="bg-slate-900 text-green-200 font-mono text-xs rounded-xl p-4 mb-5">
        <p className="text-yellow-300 font-bold mb-2">┌─────────────────────────────┐</p>
        <p>│  🏢 LOGO DA EMPRESA/COND.    │</p>
        <p className="text-cyan-300">├─────────────────────────────┤</p>
        <p className="text-yellow-300">│  📷 FOTO DO MEDIDOR  ← MAIS  │</p>
        <p className="text-yellow-300">│  (mostrador legível)  IMPORT.│</p>
        <p className="text-cyan-300">├─────────────────────────────┤</p>
        <p>│  Leitura Anterior: 444,194  │</p>
        <p>│  Leitura Atual:    457,862  │</p>
        <p>│  Consumo:           13,668  │</p>
        <p className="text-cyan-300">├─────────────────────────────┤</p>
        <p>│  Água/Esgoto:    R$ 87,50   │</p>
        <p>│  Área Comum:     R$ 12,30   │</p>
        <p className="text-green-400">│  TOTAL A PAGAR:  R$ 99,80   │</p>
        <p className="text-cyan-300">├─────────────────────────────┤</p>
        <p>│  Mini gráfico histórico 6m  │</p>
        <p className="text-yellow-300 font-bold">└─────────────────────────────┘</p>
      </div>

      <SectionTitle><Camera size={18} />Por que a foto é a parte mais importante</SectionTitle>
      <p className="text-sm text-slate-600 mb-3">
        <strong>A foto serve como prova.</strong> Se o morador questionar o valor, a foto do mostrador
        com a numeração é a evidência visual de que a leitura está correta. Sem foto, é a palavra do
        leiturista contra a do morador.
      </p>
      <Tip>
        A foto usa <code>object-contain</code> (não <code>object-cover</code>). Isso significa que a foto é exibida
        inteira, sem corte — porque cada leiturista tira a foto de um ângulo diferente, e cortar pode
        esconder justamente os números do mostrador.
      </Tip>

      <SectionTitle><Camera size={18} />Como tirar a foto do medidor corretamente</SectionTitle>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <Good>Celular na horizontal, se possível</Good>
        <Good>Mostrador ocupa pelo menos 60% da foto</Good>
        <Good>Boa iluminação, sem reflexo no vidro</Good>
        <Good>Números legíveis, foco correto</Good>
        <Bad>Foto borrada ou tremida</Bad>
        <Bad>Mostrador cortado ou muito pequeno</Bad>
        <Bad>Reflexo escondendo os dígitos</Bad>
        <Bad>Foto tirada de lado (números distorcidos)</Bad>
      </div>

      <SectionTitle><Printer size={18} />Como imprimir a filipeta corretamente</SectionTitle>
      <div className="space-y-2">
        <FlowStep n={1}>Abrir a filipeta no sistema</FlowStep>
        <FlowStep n={2}>Clicar em "Imprimir / Exportar"</FlowStep>
        <FlowStep n={3}>No diálogo do navegador: selecionar "Salvar como PDF", desmarcar cabeçalhos/rodapés, papel A4</FlowStep>
        <FlowStep n={4}>A foto do medidor aparece na versão impressa (elemento nativo, não é bloqueado pela impressora)</FlowStep>
      </div>
    </div>
  ),

  levantamento: (
    <div>
      <p className="text-slate-600 mb-4">
        Relatório comparativo de consumo por período. Permite ver <strong>vários meses lado a lado</strong>.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <Card className="border-2 border-teal-200 rounded-xl">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2"><Building size={16} /> Para Administrador / Síndico</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-1">
            <p>• Seleciona período e condomínio</p>
            <p>• Tabela densa: todas as unidades × todos os meses</p>
            <p>• Clica na unidade para ver: fotos, leituras, valores</p>
            <p>• Setas de tendência ↑↓ para identificar consumo anormal</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-sky-200 rounded-xl">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2"><Home size={16} /> Para Morador</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-1">
            <p>• Vê automaticamente apenas a sua unidade</p>
            <p>• Cada mês aparece como um card com foto grande do medidor</p>
            <p>• Não precisa expandir nada — a foto já aparece em destaque</p>
            <p>• Pode imprimir o histórico completo</p>
          </CardContent>
        </Card>
      </div>
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-900">
        <p className="font-bold mb-2">💡 Princípio: "Diferente para cada perfil"</p>
        <p>
          Um administrador precisa de uma tabela densa para comparar 50 unidades de uma vez.
          Um morador precisa de cards visuais para entender intuitivamente.
          <strong> A mesma página serve dois propósitos completamente diferentes</strong> — e muda
          de formato automaticamente conforme o perfil logado.
        </p>
      </div>
    </div>
  ),

  leituras: (
    <div>
      <p className="text-slate-600 mb-4">Registro manual ou importação de leituras dos medidores.</p>
      <SectionTitle><CircleGauge size={18} />Fluxo do leiturista</SectionTitle>
      <div className="space-y-2 mb-5">
        <FlowStep n={1}>Leiturista vai ao condomínio com o celular</FlowStep>
        <FlowStep n={2}>Abre o sistema → Leituras → Nova Leitura</FlowStep>
        <FlowStep n={3}>Seleciona: Condomínio › Bloco › Apartamento › Medidor</FlowStep>
        <FlowStep n={4}>Digita o valor do mostrador (ex: 00457,862)</FlowStep>
        <FlowStep n={5}>Tira foto do medidor com o celular</FlowStep>
        <FlowStep n={6}>Salva e vai para o próximo apartamento</FlowStep>
      </div>

      <SectionTitle><FileText size={18} />Importação em lote</SectionTitle>
      <div className="space-y-2 mb-5">
        <FlowStep n={1}>Baixar o modelo de planilha Excel do sistema</FlowStep>
        <FlowStep n={2}>Preencher todas as leituras offline</FlowStep>
        <FlowStep n={3}>Fazer upload da planilha no sistema</FlowStep>
        <FlowStep n={4}>Sistema valida e importa tudo de uma vez</FlowStep>
      </div>

      <SectionTitle><AlertTriangle size={18} />Erros comuns e como evitar</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left p-2 border rounded-tl-lg">Erro</th>
              <th className="text-left p-2 border">Causa</th>
              <th className="text-left p-2 border rounded-tr-lg">Como evitar</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Leitura menor que anterior", "Digitou errado ou medidor trocado", "Sistema alerta automaticamente antes de salvar"],
              ["Medidor não encontrado", "Chassi digitado errado", "Usar câmera para escanear o código de barras"],
              ["Foto não aparece na filipeta", "Upload falhou ou foi interrompido", "Aguardar barra de progresso completar antes de salvar"],
            ].map(([e, c, s]) => (
              <tr key={e} className="border-b hover:bg-slate-50">
                <td className="p-2 text-red-700">{e}</td>
                <td className="p-2 text-slate-600">{c}</td>
                <td className="p-2 text-green-700">{s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),

  iot: (
    <div>
      <p className="text-slate-600 mb-4">Gerenciamento dos sensores físicos instalados nos medidores que enviam leitura automaticamente.</p>
      <div className="bg-slate-900 text-green-300 font-mono text-xs rounded-xl p-4 mb-5 space-y-1">
        <p>📡 <span className="text-yellow-300">Sensor IoT</span> fixado no medidor</p>
        <p className="pl-6 text-slate-400">↓ a cada X minutos envia via rádio</p>
        <p>📶 <span className="text-yellow-300">Gateway GroupLink</span> no condomínio</p>
        <p className="pl-6 text-slate-400">↓ via internet (MQTTS / TLS)</p>
        <p>🌐 <span className="text-cyan-300">Broker MQTT</span>: mqtt.grouplinknetwork.com:8883</p>
        <p className="pl-6 text-slate-400">↓ AcquaX escuta e processa</p>
        <p>🗄️ <span className="text-green-300">Banco de dados</span> → aparece no sistema</p>
      </div>

      <SectionTitle><Settings size={18} />Como vincular Dispositivo ↔ Medidor</SectionTitle>
      <Warning>
        O dispositivo IoT envia um ID chamado <code>remote_id</code> (ex: B24A0019474D).
        Esse ID precisa corresponder ao chassi do medidor cadastrado. Se não estiver vinculado,
        a leitura chega mas é <strong>descartada silenciosamente</strong>.
      </Warning>
      <div className="space-y-2 mt-3 mb-5">
        <FlowStep n={1}>Ir em: IOTs → Lista de Dispositivos</FlowStep>
        <FlowStep n={2}>Encontrar o dispositivo pelo device_id</FlowStep>
        <FlowStep n={3}>Clicar em "Vincular Medidor"</FlowStep>
        <FlowStep n={4}>Selecionar o medidor pelo chassi correspondente</FlowStep>
        <FlowStep n={5}>Definir a data de início do vínculo</FlowStep>
      </div>

      <SectionTitle><Eye size={18} />Status possíveis de um dispositivo</SectionTitle>
      <div className="space-y-2">
        {[
          { dot: "bg-green-500",  text: "Online",      desc: "Enviou leitura nas últimas 2 horas" },
          { dot: "bg-yellow-400", text: "Atenção",     desc: "Última leitura há mais de 6 horas" },
          { dot: "bg-red-500",    text: "Offline",     desc: "Última leitura há mais de 24 horas" },
          { dot: "bg-slate-400",  text: "Sem vínculo", desc: "Recebendo dados mas não vinculado a nenhum medidor" },
        ].map(({ dot, text, desc }) => (
          <div key={text} className="flex items-center gap-3 text-sm">
            <div className={`w-3 h-3 rounded-full ${dot}`} />
            <strong className="w-20">{text}</strong>
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  ),

  reservatorio: (
    <div>
      <p className="text-slate-600 mb-4">Acompanhamento em tempo real do nível das caixas d'água dos condomínios.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 mb-5">
        <p className="font-bold mb-1">Por que isso importa:</p>
        <p>
          Um condomínio com 100 apartamentos pode ficar sem água se a caixa esvaziar durante a madrugada
          sem ninguém perceber. O sistema monitora e <strong>alerta automaticamente</strong>.
        </p>
      </div>

      <SectionTitle><Settings size={18} />Configuração de alertas</SectionTitle>
      <div className="space-y-2 mb-5">
        <div className="flex items-start gap-3 text-sm"><span className="text-red-500 font-bold">Nível mínimo:</span><span className="text-slate-600">abaixo de X% → notificação imediata ao síndico</span></div>
        <div className="flex items-start gap-3 text-sm"><span className="text-blue-500 font-bold">Nível máximo:</span><span className="text-slate-600">acima de Y% → válvula cheia (evitar desperdício)</span></div>
        <div className="flex items-start gap-3 text-sm"><span className="text-teal-500 font-bold">Canal Telegram:</span><span className="text-slate-600">cada reservatório tem um canal de notificações configurável</span></div>
      </div>

      <SectionTitle><Eye size={18} />Leitura dos dados</SectionTitle>
      <div className="space-y-2 text-sm">
        {[
          ["📏 Nível (m)", "Altura da água em metros dentro do reservatório"],
          ["🌡️ Temperatura", "Temperatura da água — detecta aquecimento anormal"],
          ["🔋 Bateria", "Nível de bateria do sensor — alertar quando abaixo de 20%"],
        ].map(([label, desc]) => (
          <div key={String(label)} className="flex gap-3 bg-white border rounded-lg p-2">
            <span className="font-medium text-slate-700 w-32 shrink-0">{label}</span>
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  ),

  contas: (
    <div>
      <p className="text-slate-600 mb-4">Registro das contas mensais de água recebidas da CESAN, SABESP ou outra concessionária.</p>
      <SectionTitle><ReceiptText size={18} />Para que serve</SectionTitle>
      <p className="text-sm text-slate-600 mb-4">
        Quando a conta geral do condomínio chega, o gestor registra: mês de referência, valor total,
        consumo total (m³) e tarifa. O sistema usa esses dados para calcular o rateio.
      </p>
      <div className="bg-slate-900 text-green-300 font-mono text-xs rounded-xl p-4 mb-5">
        <p className="text-yellow-300">Conta da concessionária:</p>
        <p>R$ 2.400,00 (480 m³ no total)</p>
        <p className="mt-2 text-cyan-300">Apt 101 consumiu: 13,668 m³ = 2,85% do total</p>
        <p className="text-green-400 font-bold">Valor do Apt 101: R$ 68,40 + rateio de área comum</p>
      </div>
      <Tip>
        Se o mês não tiver conta de concessionária cadastrada, os valores na filipeta aparecem zerados.
        Sempre cadastre a conta antes de gerar as filipetas do mês.
      </Tip>
    </div>
  ),

  design: (
    <div>
      <SectionTitle><Palette size={18} />Paleta Principal</SectionTitle>
      <div className="space-y-2 mb-5">
        {[
          { color: "bg-teal-500",   hex: "#0d9488", name: "Teal (Verde-água)", use: "Cor principal, botões primários, cabeçalhos",    psy: "Água, confiança, tecnologia limpa" },
          { color: "bg-blue-500",   hex: "#3b82f6", name: "Azul",             use: "Informação, links, dados numéricos",            psy: "Clareza, dados, confiabilidade" },
          { color: "bg-green-500",  hex: "#22c55e", name: "Verde",            use: "Sucesso, consumo normal, aprovado",             psy: "Positivo, eficiência" },
          { color: "bg-red-500",    hex: "#ef4444", name: "Vermelho",         use: "Alertas críticos, consumo alto, erro",          psy: "Atenção urgente" },
          { color: "bg-yellow-400", hex: "#f59e0b", name: "Amarelo",          use: "Avisos moderados, atenção",                    psy: "Cuidado, observação" },
          { color: "bg-slate-100 border",  hex: "#f8fafc", name: "Cinza claro",      use: "Fundos de cards, linhas alternas",             psy: "Neutralidade, limpeza" },
          { color: "bg-slate-800",  hex: "#1e293b", name: "Cinza escuro",     use: "Texto principal",                              psy: "Legibilidade" },
        ].map(({ color, hex, name, use, psy }) => (
          <div key={hex} className="flex items-center gap-3 text-sm">
            <div className={`w-8 h-8 rounded-lg ${color} shrink-0`} />
            <div className="flex-1">
              <span className="font-semibold text-slate-800">{name}</span>
              <span className="text-slate-400 ml-2 text-xs">{hex}</span>
              <p className="text-xs text-slate-500">{use} · <em>{psy}</em></p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-teal-900 text-teal-100 rounded-xl p-4 text-sm mb-5">
        <p className="font-bold text-teal-300 mb-2">Por que Teal é a cor principal</p>
        <p>
          Teal (verde-azulado) remete a <strong>água limpa, tratada, de qualidade</strong>.
          Não é o azul genérico de "tecnologia" nem o verde genérico de "sustentabilidade" —
          é a cor exata que a maioria das pessoas associa inconscientemente com água potável cristalina.
        </p>
      </div>

      <SectionTitle><Eye size={18} />Código de cores por status (universal)</SectionTitle>
      <div className="space-y-2 text-sm">
        {[
          { dot: "bg-green-500",  label: "Verde",   desc: "Tudo certo, dentro do esperado" },
          { dot: "bg-blue-500",   label: "Azul",    desc: "Informação neutra, em andamento" },
          { dot: "bg-yellow-400", label: "Amarelo", desc: "Atenção, verificar" },
          { dot: "bg-red-500",    label: "Vermelho",desc: "Problema — ação necessária imediata" },
          { dot: "bg-slate-400",  label: "Cinza",   desc: "Inativo, sem dados, desconhecido" },
        ].map(({ dot, label, desc }) => (
          <div key={label} className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${dot} shrink-0`} />
            <strong className="w-16">{label}</strong>
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>
      <Warning>
        Nunca usar vermelho para informação decorativa. Vermelho = ação urgente necessária.
        Se o usuário ver vermelho e for só estética, ele vai deixar de prestar atenção quando for real.
      </Warning>
    </div>
  ),

  principios: (
    <div>
      <div className="space-y-4">
        {[
          { n: 1, icon: <Eye size={16} />, title: "Informação progressiva", desc: "O usuário vê o resumo primeiro, detalhe depois. Na tabela de levantamento, você vê o consumo mensal. Se quiser a foto, leituras e valores, clica para expandir. Nunca jogue toda a informação de uma vez." },
          { n: 2, icon: <Target size={16} />, title: "Zero ambiguidade em números", desc: "Números de consumo sempre com unidade: 13,668 m³ — nunca apenas \"13,668\". Valores monetários sempre com símbolo: R$ 99,80 — nunca \"99.80\"." },
          { n: 3, icon: <Zap size={16} />, title: "Feedback imediato", desc: "Toda ação tem resposta visual: clicou salvar → spinner; salvou → toast verde; deu erro → toast vermelho com mensagem clara; upload de foto → barra de progresso." },
          { n: 4, icon: <Shield size={16} />, title: "Prevenção de erro > recuperação", desc: "Melhor impedir o erro do que desfazê-lo. Leitura menor que anterior → alerta antes de salvar. Excluir registro → confirmação com nome do item. Campo obrigatório vazio → destaque visual." },
          { n: 5, icon: <Smartphone size={16} />, title: "Mobile first para moradores e síndicos", desc: "Moradores consultam pelo celular. Síndicos também. Todas as telas que eles acessam funcionam perfeitamente em tela de 375px. Tabelas densas (só para admins) podem ser apenas desktop." },
        ].map(({ n, icon, title, desc }) => (
          <div key={n} className="flex gap-4 bg-white border rounded-xl p-4 shadow-sm">
            <div className="shrink-0 w-10 h-10 rounded-full bg-teal-600 text-white font-bold text-lg flex items-center justify-center">{n}</div>
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">{icon}{title}</div>
              <p className="text-sm text-slate-600">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),

  fluxos: (
    <div>
      <SectionTitle><Building2 size={18} />Fluxo 1 — Cadastrar um novo condomínio</SectionTitle>
      <p className="text-xs text-slate-500 mb-3">Tempo estimado para 50 apartamentos: 2–3 horas com planilha, 1 dia manual.</p>
      <div className="space-y-2 mb-6">
        <FlowStep n={1}>Empresa (se nova) → Administradoras → Nova Empresa</FlowStep>
        <FlowStep n={2}>Condomínios → Novo Condomínio → vincular empresa</FlowStep>
        <FlowStep n={3}>Blocos → Novo Bloco → vincular condomínio</FlowStep>
        <FlowStep n={4}>Apartamentos → Importar via planilha (mais rápido) ou cadastrar um a um</FlowStep>
        <FlowStep n={5}>Medidores → Importar via planilha (chassi × apartamento)</FlowStep>
        <FlowStep n={6}>IOTs → vincular dispositivo ao chassi do medidor</FlowStep>
        <FlowStep n={7}>Usuários → Síndico + Moradores → definir papéis</FlowStep>
      </div>

      <SectionTitle><CircleGauge size={18} />Fluxo 2 — Ciclo mensal de leituras</SectionTitle>
      <div className="space-y-1 mb-6">
        {[
          ["Dias 1–5",  "Leiturista registra as leituras (ou IoT registra automaticamente)"],
          ["Dias 1–5",  "Verificar: Leituras → filtrar mês atual → checar unidades sem leitura"],
          ["Dias 5–10", "Registrar conta da concessionária → conferir rateio automático"],
          ["Dias 10–15","Gerar filipetas → revisar: todas com foto? Valores corretos?"],
          ["Dias 10–15","Exportar PDF por condomínio → enviar para moradores"],
        ].map(([day, action], i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 text-teal-600 font-medium w-20">{day}</span>
            <span className="text-slate-600">{action}</span>
          </div>
        ))}
      </div>

      <SectionTitle><Home size={18} />Fluxo 3 — Morador consultando a fatura</SectionTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
        {["Login", "Dashboard (consumo em destaque)", "Filipeta (documento completo)", "Levantamento (histórico com fotos)"].map((step, i, arr) => (
          <React.Fragment key={step}>
            <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full">{step}</span>
            {i < arr.length - 1 && <ArrowRight size={14} className="text-teal-400" />}
          </React.Fragment>
        ))}
      </div>
      <Tip>Máximo de 3 cliques para qualquer informação — regra de UX que o sistema deve sempre respeitar.</Tip>
    </div>
  ),

  qualidade: (
    <div>
      <SectionTitle><CheckCircle2 size={18} />O que define uma boa filipeta</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-green-700 mb-2">✅ Filipeta de qualidade</p>
          <Good>Foto nítida do medidor com mostrador visível e legível</Good>
          <Good>Numeração completa — ex: 00457,862 (não apenas 457)</Good>
          <Good>Data da leitura coerente com o mês de referência</Good>
          <Good>Consumo calculado corretamente (atual - anterior)</Good>
          <Good>Valores corretos — soma de água/esgoto + área comum = total</Good>
          <Good>Logo e nome do condomínio identificados</Good>
          <Good>Histórico dos últimos meses para contexto</Good>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-red-700 mb-2">❌ Filipeta com problemas</p>
          <Bad>Foto borrada, escura ou sem o mostrador</Bad>
          <Bad>Consumo negativo (leitura menor que anterior)</Bad>
          <Bad>Valor zerado (sem conta de concessionária no mês)</Bad>
          <Bad>Campo "Sem foto do medidor"</Bad>
        </div>
      </div>

      <SectionTitle><CheckSquare size={18} />Checklist de Qualidade Mensal</SectionTitle>
      {[
        { label: "Leituras", items: ["Todas as unidades têm leitura do mês?", "Alguma leitura negativa ou variação > 200%?", "Todas as fotos foram carregadas?"] },
        { label: "Conta da Concessionária", items: ["Conta do mês foi registrada?", "Consumo total da conta é compatível com a soma das unidades?"] },
        { label: "Filipetas", items: ["Todas têm foto visível do medidor?", "Todos os valores estão preenchidos (não zerados)?", "Dados do condomínio corretos?"] },
        { label: "Antes de enviar", items: ["Imprimir uma filipeta de teste em PDF — foto aparece?", "Verificar no celular — foto está visível e legível?"] },
      ].map(({ label, items }) => (
        <div key={label} className="mb-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">{label}</p>
          <div className="space-y-1">
            {items.map(item => (
              <label key={item} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" className="rounded text-teal-600" />
                {item}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),

  melhorias: (
    <div>
      {[
        {
          priority: "Alta", color: "red", emoji: "🔴",
          items: [
            { t: "Notificações em tempo real", d: "Push notification quando leitura chegar. Alerta síndico: 'Apt 201 consumiu 3x mais'. Alerta morador: 'Sua filipeta de Março está disponível'. Canal Telegram para caixa d'água." },
            { t: "App mobile nativo (Capacitor)", d: "Transformar o site em app para iOS e Android. Moradores baixam, fazem login, recebem push notifications. Câmera integrada para o leiturista tirar foto direto pelo app." },
            { t: "Escâner de chassi do medidor", d: "Em vez de digitar B24A0019474D manualmente (e errar), câmera escaneia o código de barras ou QR do medidor para vinculação automática." },
          ]
        },
        {
          priority: "Média", color: "yellow", emoji: "🟡",
          items: [
            { t: "Linguagem simplificada para moradores", d: "Substituir 'm³' por algo mais intuitivo. Adicionar comparativo: 'Você consumiu X% a mais/menos que a média do condomínio'." },
            { t: "Importação automática do banco antigo", d: "Script de migração que lê o formato antigo e popula o novo banco — eliminando recadastramento manual." },
            { t: "Mapa do condomínio", d: "Visualizar qual bloco/apartamento está com problema. Bloco vermelho = leitura pendente. Apartamento amarelo = consumo anormal." },
            { t: "Relatório comparativo entre condomínios", d: "Ranking de consumo médio — identificar o condomínio mais eficiente e o mais desperdiçador." },
          ]
        },
        {
          priority: "Baixa", color: "green", emoji: "🟢",
          items: [
            { t: "Modo escuro", d: "Para uso noturno, especialmente leituristas que trabalham cedo. Salvar preferência por usuário." },
            { t: "Múltiplos idiomas", d: "Inglês e Espanhol para expansão futura." },
            { t: "Integração WhatsApp", d: "Enviar a filipeta direto pelo WhatsApp Business. Morador recebe o PDF no próprio WhatsApp." },
          ]
        },
      ].map(({ priority, color, emoji, items }) => (
        <div key={priority} className="mb-6">
          <h3 className={`text-base font-bold mb-3 text-${color}-700`}>{emoji} Prioridade {priority}</h3>
          <div className="space-y-3">
            {items.map(({ t, d }) => (
              <div key={t} className="bg-white border rounded-xl p-3 shadow-sm">
                <p className="font-semibold text-slate-800 text-sm mb-1">{t}</p>
                <p className="text-xs text-slate-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),

  glossario: (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-teal-50 border-b-2 border-teal-200">
              <th className="text-left p-3 font-semibold text-teal-800 w-40">Termo</th>
              <th className="text-left p-3 font-semibold text-teal-800">Significado</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Filipeta",        "Documento individual de cobrança de água de cada apartamento. O equivalente a uma mini conta de água personalizada."],
              ["Leitura",         "Registro do valor mostrado no hidrômetro em uma data específica. Ex: 00457,862 m³ em 01/03/2026."],
              ["Consumo",         "Diferença entre leitura atual e anterior. Ex: 457,862 - 444,194 = 13,668 m³."],
              ["Chassi / Registro","Número de série gravado no corpo do medidor. Identificador único. Ex: B24A0019474D."],
              ["IoT",             "\"Internet of Things\". Sensor eletrônico instalado no medidor que envia leitura automaticamente, sem precisar de leiturista."],
              ["Broker MQTT",     "Servidor intermediário que recebe mensagens dos sensores IoT e repassa para o sistema. No nosso caso: GroupLink."],
              ["Rateio",          "Divisão proporcional do custo da área comum entre os apartamentos, baseado no consumo individual."],
              ["Concessionária",  "Empresa fornecedora de água (CESAN, SABESP, SANEAGO etc.). A conta que mandam gera o rateio."],
              ["Reservatório",    "A caixa d'água do condomínio. O sistema monitora o nível em tempo real."],
              ["Complexo",        "Nome técnico para \"condomínio\" dentro do sistema. Um complexo tem blocos, que têm apartamentos."],
              ["m³",              "Metro cúbico. Unidade de volume de água. 1 m³ = 1.000 litros ≈ 5 banhos de 15 minutos."],
              ["Device ID",       "Identificador único do sensor IoT. Diferente do chassi do medidor — o device é o sensor, o chassi é o medidor físico."],
              ["remote_id",       "Número que o sensor IoT informa para identificar qual medidor está lendo. Deve corresponder ao chassi."],
              ["Levantamento",    "Relatório comparativo de múltiplos meses, mostrando a evolução do consumo."],
              ["Administradora",  "Empresa que administra o condomínio (diferente do síndico, que é morador eleito)."],
            ].map(([term, def], i) => (
              <tr key={String(term)} className={`border-b hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-3 font-semibold text-teal-700">{term}</td>
                <td className="p-3 text-slate-600">{def}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function GuiaPage() {
  const [activeChapter, setActiveChapter] = useState<string>("intro")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const chapter = chapters.find(c => c.id === activeChapter)!
  const Icon = chapter.icon
  const parts = [...new Set(chapters.map(c => c.part))]

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">

      {/* ── Sidebar ── */}
      <aside
        className={`shrink-0 overflow-y-auto bg-white border-r border-slate-200 transition-all duration-200 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}
      >
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-teal-600" />
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">Livro de UX</p>
              <p className="text-xs text-slate-400">AcquaX Field · v1.0</p>
            </div>
          </div>
        </div>
        <nav className="p-2">
          {parts.map(part => (
            <div key={part} className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1">{part}</p>
              {chapters.filter(c => c.part === part).map(c => {
                const CIcon = c.icon
                const isActive = c.id === activeChapter
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChapter(c.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors mb-0.5 ${
                      isActive
                        ? "bg-teal-50 text-teal-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? dotMap[c.color] : "bg-transparent"}`} />
                    <CIcon size={14} className="shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            title="Alternar menu"
          >
            {sidebarOpen ? <ChevronDown size={18} className="-rotate-90" /> : <ChevronRight size={18} />}
          </button>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${colorMap[chapter.color]}`}>
            <Icon size={16} />
            {chapter.title}
          </div>
          <span className="text-xs text-slate-400 ml-auto hidden sm:block">{chapter.part}</span>
        </div>

        {/* Body */}
        <div className="px-6 py-6 max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{chapter.title}</h1>
          <div className="h-1 w-16 bg-teal-500 rounded-full mb-6" />
          {CHAPTER_CONTENT[activeChapter] ?? <p className="text-slate-400">Conteúdo em breve.</p>}
        </div>

        {/* Navigation footer */}
        <div className="px-6 pb-10 flex items-center justify-between max-w-3xl">
          {(() => {
            const idx = chapters.findIndex(c => c.id === activeChapter)
            const prev = chapters[idx - 1]
            const next = chapters[idx + 1]
            return (
              <>
                {prev ? (
                  <button onClick={() => setActiveChapter(prev.id)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 transition-colors">
                    <ChevronDown size={16} className="rotate-90" />
                    {prev.title}
                  </button>
                ) : <span />}
                {next ? (
                  <button onClick={() => setActiveChapter(next.id)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 transition-colors">
                    {next.title}
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                ) : <span />}
              </>
            )
          })()}
        </div>
      </main>
    </div>
  )
}
