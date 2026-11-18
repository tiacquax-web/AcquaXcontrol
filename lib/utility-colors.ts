// Paleta única por tipo de medição — usada no Levantamento e na Filipeta.
// Água = azul, Gás = laranja, Energia = verde, sempre em tons foscos/dessaturados
// (nada de 500/600 saturado) para não cansar a vista.
export type UtilityKey = 'water' | 'gas' | 'energy';

export interface UtilityAccent {
  color: string; // texto principal
  bg: string; // fundo suave
  border: string; // borda suave
  solid: string; // botão ativo / bloco sólido
  inactive: string; // botão inativo (inclui hover)
  header: string; // faixa sólida (cabeçalho de card, badge do mês)
  softBorder: string; // borda bem suave
  softIcon: string; // ícone suave
  softText: string; // legenda / unidade
  mid: string; // texto médio (valores)
  strong: string; // texto forte (títulos)
  hex: string; // cor para gráficos (stroke)
  softHex: string; // fundo suave em hex (impressão / estilos inline)
}

export const UTILITY_ACCENTS: Record<UtilityKey, UtilityAccent> = {
  water: {
    color: 'text-[#4E7BA3]',
    bg: 'bg-[#F1F5FA]',
    border: 'border-[#DEE8F2]',
    solid: 'bg-[#5F8CB8] text-white border-[#5F8CB8]',
    inactive: 'bg-white text-[#4E7BA3] border-[#DEE8F2] hover:bg-[#F1F5FA]',
    header: 'bg-[#5F8CB8]',
    softBorder: 'border-[#E8EFF6]',
    softIcon: 'text-[#96B3CE]',
    softText: 'text-[#A9BFD2]',
    mid: 'text-[#4E7BA3]',
    strong: 'text-[#3F6486]',
    hex: '#5F8CB8',
    softHex: '#F1F5FA',
  },
  gas: {
    color: 'text-[#9C6540]',
    bg: 'bg-[#FBF3EC]',
    border: 'border-[#F2E3D5]',
    solid: 'bg-[#B57A4E] text-white border-[#B57A4E]',
    inactive: 'bg-white text-[#9C6540] border-[#F2E3D5] hover:bg-[#FBF3EC]',
    header: 'bg-[#B57A4E]',
    softBorder: 'border-[#F6EAE0]',
    softIcon: 'text-[#D3A98A]',
    softText: 'text-[#DCBB9F]',
    mid: 'text-[#9C6540]',
    strong: 'text-[#82502F]',
    hex: '#B57A4E',
    softHex: '#FBF3EC',
  },
  energy: {
    color: 'text-[#4C7E60]',
    bg: 'bg-[#F0F6F2]',
    border: 'border-[#DFEDE4]',
    solid: 'bg-[#5E9672] text-white border-[#5E9672]',
    inactive: 'bg-white text-[#4C7E60] border-[#DFEDE4] hover:bg-[#F0F6F2]',
    header: 'bg-[#5E9672]',
    softBorder: 'border-[#EAF2EC]',
    softIcon: 'text-[#9BC0AC]',
    softText: 'text-[#B0CDBB]',
    mid: 'text-[#4C7E60]',
    strong: 'text-[#3D6850]',
    hex: '#5E9672',
    softHex: '#F0F6F2',
  },
};

/** Normaliza qualquer valor de tipo de medição para uma chave válida (default: água). */
export function utilityAccent(type?: string | null): UtilityAccent {
  const key = (type === 'gas' || type === 'energy' ? type : 'water') as UtilityKey;
  return UTILITY_ACCENTS[key];
}
