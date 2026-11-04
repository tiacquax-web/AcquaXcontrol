/**
 * Guia de navegação da Mariana: o passo a passo REAL de como chegar em cada
 * informação do AcquaXcontrol, por perfil. Fonte: páginas do app (app/(main))
 * e o Guia de Uso oficial (/guia).
 *
 * Regra: só entra aqui o que existe de fato na interface. Se mudar rota ou
 * botão, atualize este arquivo — é a base que a assistente usa para ensinar.
 */

export type Papel = 'morador' | 'sindico' | 'admin';

export interface PassoGuia {
  id: string;
  titulo: string;
  rota: string;
  palavras_chave: string[];
  papeis: Papel[];
  resumo: string;
  passos: { morador?: string[]; sindico?: string[]; admin?: string[] };
}

export const GUIA: PassoGuia[] = [
  {
    id: 'filipeta',
    titulo: 'Filipeta de Medição (sua conta do mês)',
    rota: '/meter-report',
    palavras_chave: ['filipeta', 'conta', 'fatura', 'consumo do mes', 'minha conta', 'valor a pagar'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Mostra consumo, parte comum, valor total, leituras e a tarifa da conta do mês.',
    passos: {
      morador: [
        'No menu lateral, toque em "Filipeta Medição".',
        'Escolha o mês e o ano no seletor do topo.',
        'Confira Consumo (m³), Parte Comum, Total e a Tarifa aplicada na conta do condomínio.',
        'Use "Imprimir / Exportar" para salvar em PDF.',
      ],
      sindico: [
        'Menu lateral > "Filipeta Medição".',
        'Selecione o condomínio (e o bloco, se quiser filtrar).',
        'Escolha mês e ano; a lista mostra todas as unidades.',
        'Para uma unidade específica, use a busca por unidade; para o arquivo, "Imprimir / Exportar".',
      ],
      admin: [
        'Menu lateral > "Filipeta Medição".',
        'Filtre por condomínio, bloco e mês/ano.',
        'Confira a Tarifa exibida no cabeçalho (vem do cadastro da conta em "Contas").',
        'Exporte por "Imprimir / Exportar" (ou peça a planilha para mim).',
      ],
    },
  },
  {
    id: 'levantamento',
    titulo: 'Levantamento de Consumo (comparativo por período)',
    rota: '/levantamento',
    palavras_chave: ['levantamento', 'comparativo', 'historico', 'grafico', 'evolucao', 'media'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Compara meses: consumo, leituras e valores, com gráfico e média.',
    passos: {
      morador: [
        'Menu lateral > "Levantamento".',
        'Selecione os meses que quer comparar.',
        'Veja os cards do mês (leitura, consumo, consumo médio) e o gráfico de evolução.',
      ],
      sindico: [
        'Menu lateral > "Levantamento" e escolha o condomínio.',
        'Selecione o período; a tabela traz todas as unidades.',
        'Use os filtros de bloco/unidade e o botão de imprimir para gerar o relatório.',
      ],
      admin: [
        'Menu lateral > "Levantamento", escolha condomínio e período.',
        'Confira os KPIs no topo (unidades, meses, consumo médio, consumo total).',
        'A coluna de cada mês mostra a Tarifa usada na conta.',
      ],
    },
  },
  {
    id: 'analise-consumo',
    titulo: 'Análise de Consumo',
    rota: '/consumption-dashboard',
    palavras_chave: ['analise', 'padrao', 'comparar com vizinhos', 'tendencia', 'picos'],
    papeis: ['sindico', 'admin', 'morador'],
    resumo: 'Painel de análise de consumo por período, bloco e unidade.',
    passos: {
      morador: ['Menu lateral > "Análise de Consumo" (quando liberado para o seu perfil).', 'Escolha o período para ver a evolução.'],
      sindico: ['Menu lateral > "Análise de Consumo".', 'Selecione condomínio e período; use os gráficos por bloco/unidade para achar outliers.'],
      admin: ['Menu lateral > "Análise de Consumo".', 'Combine filtros de condomínio, bloco e período para investigar variações.'],
    },
  },
  {
    id: 'contas',
    titulo: 'Contas de Concessionária (tarifa e valor da conta)',
    rota: '/dealership-readings',
    palavras_chave: ['tarifa', 'conta do condominio', 'concessionaria', 'coeficiente', 'valor da conta'],
    papeis: ['sindico', 'admin'],
    resumo: 'Onde se cadastra a conta do condomínio mês a mês, incluindo a Tarifa (obrigatória).',
    passos: {
      sindico: ['Menu lateral > "Contas".', 'Selecione o condomínio e o mês.', 'A Tarifa é campo obrigatório; sem ela a filipeta fica com "Tarifa não informada".'],
      admin: ['Menu lateral > "Contas".', 'Escolha condomínio e competência; confira consumo da concessionária, valor total e Tarifa.', 'Ao salvar, a tarifa passa a aparecer na filipeta e no levantamento.'],
    },
  },
  {
    id: 'leituras',
    titulo: 'Leituras (subir leitura do medidor)',
    rota: '/readings',
    palavras_chave: ['leitura', 'medidor', 'foto do medidor', 'lancar leitura', 'autoleitura'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Lançamento e conferência de leituras, com foto do medidor.',
    passos: {
      morador: ['Menu lateral > "Leituras" (quando o condomínio usa autoleitura).', 'Informe a leitura atual e envie a foto do medidor.'],
      sindico: ['Menu lateral > "Leituras".', 'Filtre por condomínio/bloco e veja o que já foi lançado e o que está pendente.'],
      admin: ['Menu lateral > "Leituras".', 'Use a importação por planilha quando houver muitas unidades.'],
    },
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios (apartamento)',
    rota: '/apartment-report',
    palavras_chave: ['relatorio', 'relatorio da unidade', 'historico da unidade'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Relatório detalhado por unidade, com histórico de leituras e valores.',
    passos: {
      morador: ['Menu lateral > "Relatórios".', 'Escolha o período para ver o detalhamento da sua unidade.'],
      sindico: ['Menu lateral > "Relatórios".', 'Selecione condomínio, bloco e unidade.'],
      admin: ['Menu lateral > "Relatórios".', 'Combine condomínio, bloco, unidade e período.'],
    },
  },
  {
    id: 'monitoramento',
    titulo: 'Monitoramento, Alertas e Medidores de Nível',
    rota: '/monitoring',
    palavras_chave: ['monitoramento', 'iot', 'alerta', 'vazamento', 'reservatorio', 'nivel'],
    papeis: ['sindico', 'admin'],
    resumo: 'Dados de sensores (GroupLink): consumo em tempo real, alertas e nível de reservatório.',
    passos: {
      sindico: ['Menu lateral > "Monitoramento" para o consumo em tempo real.', '"Central de Alertas" mostra vazamentos e anomalias.', '"Medidores de Nível" mostra os reservatórios.'],
      admin: ['Menu lateral > "Monitoramento", "Central de Alertas" e "Medidores de Nível".', 'Se o condomínio não aparecer, verifique em "IOTs" se os dispositivos têm GroupLink vinculado.'],
    },
  },
  {
    id: 'apuracao',
    titulo: 'Apuração (fechar o mês)',
    rota: '/apuracao',
    palavras_chave: ['apuracao', 'fechar o mes', 'processar', 'gerar filipetes'],
    papeis: ['admin', 'sindico'],
    resumo: 'Processa as leituras do mês e gera as filipetes das unidades.',
    passos: {
      sindico: ['Menu lateral > "Apuração".', 'Selecione condomínio e competência e confira as leituras antes de processar.'],
      admin: ['Menu lateral > "Apuração".', 'Escolha condomínio e mês; processe e confirme que as filipetes foram geradas.'],
    },
  },
  {
    id: 'suporte',
    titulo: 'Suporte (abrir chamado)',
    rota: '/suporte',
    palavras_chave: ['suporte', 'chamado', 'atendimento', 'problema', 'reclamacao', 'falar com pessoa'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Canal de atendimento com histórico de mensagens e anexos.',
    passos: {
      morador: ['Menu lateral > "Suporte".', 'Clique em "Novo chamado", escreva o assunto e detalhe o problema (pode anexar imagem).', 'Acompanhe as respostas na mesma tela; você recebe aviso de resposta.'],
      sindico: ['Menu lateral > "Suporte".', 'Abra o chamado informando condomínio e unidade para agilizar.'],
      admin: ['Menu lateral > "Suporte".', 'Filtre por condomínio e status para acompanhar os atendimentos.'],
    },
  },
  {
    id: 'comunicados',
    titulo: 'Comunicados',
    rota: '/comunicado',
    palavras_chave: ['comunicado', 'aviso', 'avisar moradores', 'comunicar'],
    papeis: ['sindico', 'admin'],
    resumo: 'Envio de comunicados para os moradores.',
    passos: {
      sindico: ['Menu lateral > "Comunicados".', 'Escreva o assunto e a mensagem e escolha o público (condomínio/bloco).'],
      admin: ['Menu lateral > "Comunicados".', 'Selecione condomínio e público-alvo antes de enviar.'],
    },
  },
  {
    id: 'cadastros',
    titulo: 'Cadastros (condomínios, blocos, apartamentos, medidores)',
    rota: '/complexes',
    palavras_chave: ['cadastro', 'condominio', 'bloco', 'apartamento', 'medidor', 'cadastrar unidade'],
    papeis: ['admin'],
    resumo: 'Estrutura do sistema: administradoras, condomínios, blocos, apartamentos e medidores.',
    passos: {
      admin: [
        'Menu lateral > "Condomínios" para criar/editar o condomínio.',
        'Depois "Blocos" e "Apartamentos" para montar as unidades.',
        'Em "Medidores" vincule o medidor à unidade.',
        '"IOTs" e "GroupLink (GL)" para dispositivos conectados.',
      ],
    },
  },
  {
    id: 'usuarios',
    titulo: 'Usuários, papéis e links de cadastro',
    rota: '/users',
    palavras_chave: ['usuario', 'morador', 'senha', 'acesso', 'permissao', 'papel', 'link de cadastro', 'convidar'],
    papeis: ['sindico', 'admin'],
    resumo: 'Quem acessa o sistema, com qual papel, e como convidar moradores.',
    passos: {
      sindico: ['Menu lateral > "Usuários" para ver quem está vinculado às unidades.', 'O residente pode ser convidado por "Links de Cadastro".'],
      admin: [
        'Menu lateral > "Usuários": criar, editar, reenviar credenciais ou importar por planilha.',
        '"Papéis" define as permissões e "Personalização de Perfis" ajusta o que cada perfil vê.',
        '"Links de Cadastro" gera convites por unidade.',
      ],
    },
  },
  {
    id: 'conta',
    titulo: 'Minha conta (e-mail e senha de acesso)',
    rota: '/account',
    palavras_chave: ['minha conta', 'trocar email', 'trocar senha', 'meu perfil', 'credenciais'],
    papeis: ['morador', 'sindico', 'admin'],
    resumo: 'Dados do próprio acesso.',
    passos: {
      morador: ['Clique no seu nome/avatar no menu e abra "Minha conta".', 'Para trocar o e-mail, me peça que eu altero (envio o aviso para o novo endereço).', 'Para senha, use "Esqueci minha senha" na tela de login.'],
      sindico: ['Menu lateral > "Minha conta" para dados do seu acesso.'],
      admin: ['Menu lateral > "Minha conta"; para alterar o acesso de outra pessoa, use "Usuários".'],
    },
  },
];

/** Busca por tema (palavras-chave, título) e filtra pelos papéis do usuário. */
export function buscarNoGuia(termo: string, papeis: Papel[]): PassoGuia[] {
  const norm = (v: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const alvo = norm(termo);
  const palavras = alvo.split(/\s+/).filter(p => p.length > 2);

  const pontuar = (g: PassoGuia): number => {
    const campos = [norm(g.titulo), norm(g.resumo), ...g.palavras_chave.map(norm), norm(g.id)];
    let pontos = 0;
    for (const p of palavras) {
      if (campos.some(c => c === p)) pontos += 3;
      else if (campos.some(c => c.includes(p))) pontos += 2;
    }
    if (papeis.length && g.papeis.some(p => papeis.includes(p))) pontos += 1;
    return pontos;
  };

  return GUIA
    .map(g => ({ g, p: pontuar(g) }))
    .filter(x => x.p > 1)
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map(x => x.g);
}

/** Sumário para quando o usuário pergunta "o que você sabe ensinar". */
export function sumarioGuia(papeis: Papel[]) {
  return GUIA
    .filter(g => !papeis.length || g.papeis.some(p => papeis.includes(p)))
    .map(g => ({ tema: g.titulo, rota: g.rota }));
}
