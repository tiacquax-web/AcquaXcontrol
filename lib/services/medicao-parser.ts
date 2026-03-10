/**
 * Serviço de parse da planilha de medição AcquaX
 *
 * Suporta dois formatos:
 *  1. Planilha com múltiplas fases (ex: Contemporâneo I e II)
 *     - Aba INFORMAÇÕES: dados das contas (Fase 1 cols A-F, Fase 2 cols mais à direita)
 *     - Abas "SISTEMA FASE I", "SISTEMA FASE II", etc.
 *  2. Planilha condomínio único com aba "MEDIÇÃO" ou "SISTEMA"
 *     - Aba INFORMAÇÕES: dados da conta numa única seção
 *     - Aba "SISTEMA" ou "MEDIÇÃO": dados das unidades
 *
 * Campos da conta extraídos de INFORMAÇÕES:
 *   B4  = Ano de referência
 *   B6  = Mês de referência (ex: "NOVEMBRO")
 *   B7  = Data de leitura atual
 *   B8  = Data de leitura anterior
 *   B9  = Data de próxima leitura
 *   F6  = Nome da concessionária (Fase 1)
 *   F7  = Conta total R$ (Fase 1)
 *   F8  = Consumo real m³ (Fase 1)
 *   F9  = Modalidade de cobrança (Fase 1)
 *   F10 = Vencimento da conta (Fase 1)
 *   F11 = Recursos Hídricos R$ (Fase 1)
 *   F13 = Valor Água R$ (Fase 1)
 *   F14 = Valor Esgoto R$ (Fase 1)
 *   F15 = Dias (Fase 1)
 *
 * Para Fase 2: mesmos campos mas nas linhas 19-28
 */

import * as XLSX from "xlsx";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ContaInfo {
  /** Nome do condomínio detectado (do campo 'condominio' das linhas) */
  condominioName: string;
  /** Nome do condomínio na aba INFORMAÇÕES */
  condominioLabel?: string;
  /** Aba de onde vieram os dados das unidades */
  sheetName: string;
  /** Mês de referência numérico (ex: "11") */
  monthRef: string;
  /** Ano de referência (ex: "2025") */
  yearRef: string;
  /** Data da leitura (YYYY-MM-DD) */
  readingDate: string;
  /** Data da leitura anterior (YYYY-MM-DD) */
  readingDatePrev: string;
  /** Data da próxima leitura (YYYY-MM-DD) */
  readingDateNext: string;
  /** Nome da concessionária */
  dealershipName: string;
  /** Conta total R$ */
  totalValue: number;
  /** Consumo real m³ */
  dealershipConsumption: number;
  /** Modalidade (PROGRESSIVIDADE, MÍNIMO, etc.) */
  modalidade: string;
  /** Vencimento da conta */
  invoiceDate: string;
  /** Recursos Hídricos R$ */
  recursosHidricos: number;
  /** Valor Água R$ */
  consumptionValue: number;
  /** Valor Esgoto R$ */
  sewageValue: number;
  /** Total de dias */
  totalDays: number;
  /** Consumo Mínimo m³ */
  consumptionMinimo: number;
}

export interface UnidadeRow {
  condominio: string;
  ano_ref: number | string;
  mes_ref: string;
  bloco: string;
  apartamento: string | number;
  consumo_agua_m3: number;
  valor_consumo_agua: number;
  valor_esgoto: number;
  consumo_pipa_m3: number;
  custo_pipa: number;
  rateio_agua: number;
  consumo_total_agua_m3: number;
  valor_total_agua_unidade: number;
  consumo_gas_m3: number;
  valor_consumo_gas: number;
  prox_leitura: string;
  foto: string;
  pre_leitura: string;
  leitura: number;
  data_leitura: string;
  chassi: string;
}

export interface MedicaoParsed {
  /** Contas extraídas da aba INFORMAÇÕES */
  contas: ContaInfo[];
  /** Unidades por conta (key = sheetName ou condominioName) */
  unidades: Record<string, UnidadeRow[]>;
  /** Avisos não-fatais */
  warnings: string[];
  /** Erros que impedem o processamento */
  errors: string[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTH_NAME_TO_NUM: Record<string, string> = {
  janeiro: "01", fevereiro: "02", março: "03", marco: "03",
  abril: "04", maio: "05", junho: "06", julho: "07",
  agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function excelDateToISO(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "string") {
    // DD/MM/YYYY
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    // YYYY-MM-DD already
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    return val;
  }
  if (typeof val === "number") {
    // Excel serial
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`;
    }
  }
  return String(val);
}

function monthNameToNum(val: any): string {
  if (!val) return "";
  const s = String(val).toLowerCase().trim();
  return MONTH_NAME_TO_NUM[s] || s;
}

function toNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function getCellValue(ws: XLSX.WorkSheet, cellAddr: string): any {
  const cell = ws[cellAddr];
  if (!cell) return null;
  return cell.v ?? cell.w ?? null;
}

// ─── Parse da aba INFORMAÇÕES ──────────────────────────────────────────────────

/**
 * Extrai dados da conta da aba INFORMAÇÕES.
 * Detecta automaticamente quantas fases/condomínios existem.
 */
function parseInfoSheet(ws: XLSX.WorkSheet): { contas: Omit<ContaInfo, "sheetName" | "condominioName" | "unidades">[], warnings: string[] } {
  const warnings: string[] = [];
  const contas: any[] = [];

  // Converter para array de linhas para fácil acesso
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:AZ100");
  const maxRow = Math.min(range.e.r + 1, 50); // Primeiras 50 linhas são suficientes

  // Leitura matricial
  const grid: any[][] = [];
  for (let r = 0; r < maxRow; r++) {
    const rowData: any[] = [];
    for (let c = 0; c <= Math.min(range.e.c, 55); c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      rowData.push(cell ? (cell.v ?? null) : null);
    }
    grid.push(rowData);
  }

  // row index (0-based): linha 4 = index 3, linha 6 = index 5, etc.
  // Ano: linha 4 col B (index 3,1)
  const ano = String(grid[3]?.[1] || new Date().getFullYear());
  // Mês: linha 6 col B (index 5,1)
  const mesRaw = grid[5]?.[1];
  const monthRef = monthNameToNum(mesRaw);

  // Datas comuns (mesmas para todas as fases se não houver colunas separadas)
  // Linha 7 B = data leitura, Linha 8 B = anterior, Linha 9 B = próxima
  const dataLeitura   = excelDateToISO(grid[6]?.[1]);
  const dataAnterior  = excelDateToISO(grid[7]?.[1]);
  const dataProxima   = excelDateToISO(grid[8]?.[1]);

  // ── Detectar colunas das fases ──────────────────────────────────────────
  // Procura células com "FASE 1" / "FASE I" / "DADOS DA CONTA - Fase 1" etc.
  // Estratégia: varrer linha 1 (index 0) e linha 4 (index 3) em busca de cabeçalhos de fase
  const faseColumns: { label: string, startCol: number }[] = [];

  for (let r = 0; r <= 5; r++) {
    for (let c = 0; c < grid[r]?.length; c++) {
      const v = String(grid[r]?.[c] ?? "").toUpperCase().trim();
      if (/FASE\s*(1|I|II|2)/.test(v) || /DADOS DA CONTA.*FASE/i.test(v)) {
        const faseNum = v.match(/FASE\s*(II|2)/i) ? "2" : "1";
        const label = `Fase ${faseNum}`;
        if (!faseColumns.find(f => f.label === label)) {
          faseColumns.push({ label, startCol: c });
        }
      }
    }
  }

  // Se não detectou fases pela linha de cabeçalho, assume Fase única com dados na col E (index 4)
  if (faseColumns.length === 0) {
    faseColumns.push({ label: "Fase 1", startCol: 4 }); // col E = index 4
  }

  // Para cada fase detectada, extrair dados
  for (const fase of faseColumns) {
    const col = fase.startCol; // coluna base dos dados (concessionária, conta, consumo, etc.)

    // Estratégia: varrer as linhas 4-30 procurando as células de dados conhecidas
    // Coluna F (index 5) para o Contemporâneo, mas pode variar
    // Usamos col como base e tentamos col+1 também

    let concessionaria = "";
    let totalValue = 0;
    let dealershipConsumption = 0;
    let modalidade = "";
    let invoiceDate = "";
    let recursosHidricos = 0;
    let consumptionValue = 0;
    let sewageValue = 0;
    let totalDays = 0;
    let consumptionMinimo = 0;
    let condominioLabel = "";

    // Varrer linhas 3-30 buscando por labels conhecidos
    for (let r = 3; r < Math.min(35, grid.length); r++) {
      const row = grid[r];
      if (!row) continue;

      // Verificar label na col A (index 0) ou B (index 1)
      const labelA = String(row[0] ?? "").toLowerCase().trim();
      const labelB = String(row[1] ?? "").toLowerCase().trim();

      // Valor normalmente fica em col col, col+1 ou col-1
      const val = (c: number) => row[c] ?? row[c+1] ?? null;

      // Concessionária: procurar em colunas próximas ao col
      if (labelA.includes("concession") || labelA.includes("concession")) {
        const v = val(col) ?? val(col-1);
        if (v) concessionaria = String(v);
      }
      // Conta Total
      if (labelA.includes("conta total") || (labelA.includes("conta") && labelA.includes("total"))) {
        const v = val(col) ?? val(col-1);
        if (v != null) totalValue = toNum(v);
      }
      // Consumo real m³
      if (labelA.includes("consumo") && labelA.includes("real")) {
        const v = val(col) ?? val(col-1);
        if (v != null) dealershipConsumption = toNum(v);
      }
      // Modalidade
      if (labelA.includes("modalidade") || labelA.includes("modalidade de cobran")) {
        const v = val(col) ?? val(col-1) ?? row[6] ?? row[7];
        if (v) modalidade = String(v);
      }
      // Vencimento
      if (labelA.includes("vencimento")) {
        const v = val(col) ?? val(col-1);
        if (v) invoiceDate = excelDateToISO(v);
      }
      // Recursos Hídricos
      if (labelA.includes("recursos") || labelA.includes("recusos")) {
        const v = val(col) ?? val(col-1);
        if (v != null) recursosHidricos = toNum(v);
      }
      // Valor Água
      if (labelA.includes("valor") && labelA.includes("água") || labelA.includes("valor agua")) {
        const v = val(col) ?? val(col-1);
        if (v != null) consumptionValue = toNum(v);
      }
      // Valor Esgoto
      if (labelA.includes("valor") && labelA.includes("esgoto")) {
        const v = val(col) ?? val(col-1);
        if (v != null) sewageValue = toNum(v);
      }
      // Dias
      if ((labelA.includes("dias") || labelA.includes("total de dias")) && !labelA.includes("consumo")) {
        const v = val(col) ?? val(col-1);
        if (v != null) totalDays = toNum(v);
      }
      // Consumo mínimo
      if (labelA.includes("consumo") && labelA.includes("mínimo") || labelA.includes("consumo do minimo")) {
        const v = val(col) ?? val(col-1);
        if (v != null) consumptionMinimo = toNum(v);
      }
      // Nome do condomínio
      if (r < 8 && (labelA.includes("nome") && labelA.includes("condomín"))) {
        const v = row[1] ?? row[2];
        if (v) condominioLabel = String(v);
      }
    }

    // Fallback: tentar leitura posicional clássica (para o formato Contemporâneo)
    // que tem o layout fixo com F=col5, G=col6 etc.
    const fCol = fase.startCol; // já é o col correto

    if (!concessionaria) {
      // linha 6 (index 5), col do fase
      const v = grid[5]?.[fCol] ?? grid[5]?.[fCol+1];
      if (v) concessionaria = String(v);
    }
    if (!totalValue) {
      const v = grid[6]?.[fCol] ?? grid[6]?.[fCol+1];
      if (v != null) totalValue = toNum(v);
    }
    if (!dealershipConsumption) {
      const v = grid[7]?.[fCol] ?? grid[7]?.[fCol+1];
      if (v != null) dealershipConsumption = toNum(v);
    }
    if (!modalidade) {
      const v = grid[8]?.[fCol] ?? grid[8]?.[fCol+1] ?? grid[8]?.[6] ?? grid[8]?.[7];
      if (v) modalidade = String(v);
    }
    if (!invoiceDate) {
      const v = grid[9]?.[fCol] ?? grid[9]?.[fCol+1];
      if (v) invoiceDate = excelDateToISO(v);
    }
    if (!recursosHidricos) {
      const v = grid[10]?.[fCol] ?? grid[10]?.[fCol+1];
      if (v != null) recursosHidricos = toNum(v);
    }
    if (!consumptionValue) {
      const v = grid[12]?.[fCol] ?? grid[12]?.[fCol+1];
      if (v != null) consumptionValue = toNum(v);
    }
    if (!sewageValue) {
      const v = grid[13]?.[fCol] ?? grid[13]?.[fCol+1];
      if (v != null) sewageValue = toNum(v);
    }
    if (!totalDays) {
      const v = grid[14]?.[fCol] ?? grid[14]?.[fCol+1];
      if (v != null) totalDays = toNum(v);
    }
    if (!consumptionMinimo) {
      const v = grid[18]?.[fCol] ?? grid[18]?.[fCol+1];
      if (v != null) consumptionMinimo = toNum(v);
    }
    if (!condominioLabel) {
      const v = grid[1]?.[1] ?? grid[1]?.[2];
      if (v) condominioLabel = String(v);
    }

    if (!concessionaria && !totalValue) {
      warnings.push(`Fase "${fase.label}": não foi possível extrair dados da aba INFORMAÇÕES`);
      continue;
    }

    contas.push({
      condominioLabel,
      faseLabel: fase.label,
      monthRef,
      yearRef: ano,
      readingDate: dataLeitura,
      readingDatePrev: dataAnterior,
      readingDateNext: dataProxima,
      dealershipName: concessionaria,
      totalValue,
      dealershipConsumption,
      modalidade,
      invoiceDate,
      recursosHidricos,
      consumptionValue,
      sewageValue,
      totalDays,
      consumptionMinimo,
    });
  }

  return { contas, warnings };
}

// ─── Parse das abas SISTEMA ────────────────────────────────────────────────────

/**
 * Encontra as abas de dados de unidades (SISTEMA FASE I, SISTEMA FASE II, MEDIÇÃO, etc.)
 * e mapeia cada aba para um nome de condomínio.
 */
function findDataSheets(workbook: XLSX.WorkBook): { sheetName: string, isMultiPhase: boolean }[] {
  const sheets: { sheetName: string, isMultiPhase: boolean }[] = [];

  for (const name of workbook.SheetNames) {
    const upper = name.toUpperCase().trim();
    // Excluir abas que não são dados de unidades
    if (upper.includes("RELATÓRIO") || upper.includes("RELATORIO") ||
        upper.includes("DASHBOARD") || upper.includes("MEDIA ANUAL") ||
        upper.includes("INFORMAÇÕES") || upper.includes("INFORMACOES") ||
        upper.includes("FASE I") && !upper.includes("SISTEMA") ||
        upper.includes("FASE II") && !upper.includes("SISTEMA")) {
      continue;
    }
    if (upper.includes("SISTEMA") || upper.includes("MEDIÇÃO") ||
        upper.includes("MEDICAO") || upper.includes("MEDICO")) {
      sheets.push({ sheetName: name, isMultiPhase: upper.includes("FASE") });
    }
  }

  // Se não encontrou nada, tenta a primeira aba que não é INFORMAÇÕES e tem dados tabulares
  if (sheets.length === 0) {
    for (const name of workbook.SheetNames) {
      const upper = name.toUpperCase().trim();
      if (upper.includes("INFORMAÇÕES") || upper.includes("RELATÓRIO") || upper.includes("DASHBOARD")) continue;
      const ws = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
      if (data.length > 5 && data[0]?.some((h: any) => String(h || "").toLowerCase().includes("bloco") ||
          String(h || "").toLowerCase().includes("apartamento"))) {
        sheets.push({ sheetName: name, isMultiPhase: false });
      }
    }
  }

  return sheets;
}

/**
 * Parse de uma aba de dados de unidades (SISTEMA FASE I, MEDIÇÃO, etc.)
 */
function parseDataSheet(ws: XLSX.WorkSheet, sheetName: string): { rows: UnidadeRow[], condominioNames: string[], warnings: string[] } {
  const warnings: string[] = [];

  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });

  // Normalizar colunas
  const rows: UnidadeRow[] = [];
  const condominioNames = new Set<string>();

  for (const r of rawData) {
    // Normalizar chaves
    const norm: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (!k) continue;
      const key = k.toString().trim().toLowerCase().replace(/\s+/g, "_");
      norm[key] = v;
    }

    // Pular linhas sem bloco ou apartamento (rodapés, totais)
    if (!norm.bloco && !norm.apartamento) continue;
    // Pular linhas onde condomínio não parece válido
    if (!norm.condominio || String(norm.condominio).trim() === "") continue;

    const condName = String(norm.condominio).trim();
    condominioNames.add(condName);

    rows.push({
      condominio: condName,
      ano_ref: norm.ano_ref ?? "",
      mes_ref: String(norm.mes_ref ?? "").trim(),
      bloco: String(norm.bloco ?? "").trim(),
      apartamento: norm.apartamento ?? "",
      consumo_agua_m3: toNum(norm.consumo_agua_m3),
      valor_consumo_agua: toNum(norm.valor_consumo_agua),
      valor_esgoto: toNum(norm.valor_esgoto),
      consumo_pipa_m3: toNum(norm.consumo_pipa_m3),
      custo_pipa: toNum(norm.custo_pipa),
      rateio_agua: toNum(norm.rateio_agua),
      consumo_total_agua_m3: toNum(norm.consumo_total_agua_m3),
      valor_total_agua_unidade: toNum(norm.valor_total_agua_unidade),
      consumo_gas_m3: toNum(norm.consumo_gas_m3),
      valor_consumo_gas: toNum(norm.valor_consumo_gas),
      prox_leitura: excelDateToISO(norm.prox_leitura),
      foto: String(norm.foto ?? "").trim(),
      pre_leitura: String(norm.pre_leitura ?? "Não").trim(),
      leitura: toNum(norm.leitura),
      data_leitura: excelDateToISO(norm.data_leitura),
      chassi: String(norm.chassi ?? "").trim(),
    });
  }

  return { rows, condominioNames: Array.from(condominioNames), warnings };
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Faz o parse completo de um arquivo Excel de medição.
 * Retorna os dados estruturados prontos para criar contas e importar unidades.
 */
export async function parseMedicaoFile(buffer: ArrayBuffer): Promise<MedicaoParsed> {
  const warnings: string[] = [];
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch (e) {
    return { contas: [], unidades: {}, warnings, errors: ["Arquivo inválido ou corrompido"] };
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { contas: [], unidades: {}, warnings, errors: ["Arquivo não contém planilhas"] };
  }

  // ── 1. Parse da aba INFORMAÇÕES ──────────────────────────────────────────
  const infoSheetName = workbook.SheetNames.find(n =>
    n.toUpperCase().includes("INFORMAÇ") || n.toUpperCase().includes("INFORMAC")
  );

  let contasRaw: any[] = [];

  if (infoSheetName) {
    const ws = workbook.Sheets[infoSheetName];
    const result = parseInfoSheet(ws);
    contasRaw = result.contas;
    warnings.push(...result.warnings);
  } else {
    warnings.push("Aba INFORMAÇÕES não encontrada — dados da conta precisarão ser preenchidos manualmente");
  }

  // ── 2. Encontrar e parsear abas de dados das unidades ───────────────────
  const dataSheets = findDataSheets(workbook);

  if (dataSheets.length === 0) {
    errors.push("Nenhuma aba de dados encontrada. Esperado: 'SISTEMA FASE I', 'MEDIÇÃO', etc.");
    return { contas: [], unidades: {}, warnings, errors };
  }

  const unidades: Record<string, UnidadeRow[]> = {};
  const sheetCondominioMap: Record<string, string[]> = {};

  for (const { sheetName } of dataSheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const { rows, condominioNames, warnings: sheetWarns } = parseDataSheet(ws, sheetName);
    warnings.push(...sheetWarns);
    if (rows.length === 0) {
      warnings.push(`Aba "${sheetName}" não contém dados válidos`);
      continue;
    }
    unidades[sheetName] = rows;
    sheetCondominioMap[sheetName] = condominioNames;
  }

  // ── 3. Associar contas com abas de dados ───────────────────────────────
  const contas: ContaInfo[] = [];

  if (contasRaw.length > 0) {
    // Para cada conta extraída, encontrar a aba de dados correspondente
    for (const conta of contasRaw) {
      // Tentar match por fase (Fase 1 → SISTEMA FASE I, Fase 2 → SISTEMA FASE II)
      let matchedSheet: string | null = null;
      let matchedCondominioName = "";

      const faseNum = conta.faseLabel?.includes("2") ? "2" : "1";
      const faseRoman = faseNum === "2" ? "II" : "I";

      // Busca por aba correspondente à fase
      for (const sheetName of Object.keys(unidades)) {
        const upper = sheetName.toUpperCase();
        if (faseNum === "2" && (upper.includes("FASE II") || upper.includes("FASE 2"))) {
          matchedSheet = sheetName;
          matchedCondominioName = sheetCondominioMap[sheetName]?.[0] || "";
          break;
        }
        if (faseNum === "1" && (upper.includes("FASE I") || upper.includes("FASE 1")) &&
            !upper.includes("FASE II") && !upper.includes("FASE 2")) {
          matchedSheet = sheetName;
          matchedCondominioName = sheetCondominioMap[sheetName]?.[0] || "";
          break;
        }
      }

      // Fallback: pegar a única aba disponível
      if (!matchedSheet && Object.keys(unidades).length === 1) {
        matchedSheet = Object.keys(unidades)[0];
        matchedCondominioName = sheetCondominioMap[matchedSheet]?.[0] || "";
      }

      if (!matchedSheet) {
        warnings.push(`Não foi possível associar a conta "${conta.faseLabel}" a uma aba de dados`);
        continue;
      }

      contas.push({
        ...conta,
        sheetName: matchedSheet,
        condominioName: matchedCondominioName || conta.condominioLabel || "",
      });
    }
  } else {
    // Sem INFORMAÇÕES: criar uma conta "vazia" por aba de dados para preenchimento manual
    for (const [sheetName, rows] of Object.entries(unidades)) {
      const firstRow = rows[0];
      const condName = sheetCondominioMap[sheetName]?.[0] || firstRow?.condominio || "";
      const monthRef = monthNameToNum(firstRow?.mes_ref) || "";
      const yearRef = String(firstRow?.ano_ref || "");
      contas.push({
        condominioName: condName,
        condominioLabel: condName,
        sheetName,
        monthRef,
        yearRef,
        readingDate: firstRow?.data_leitura || "",
        readingDatePrev: "",
        readingDateNext: firstRow?.prox_leitura || "",
        dealershipName: "",
        totalValue: 0,
        dealershipConsumption: 0,
        modalidade: "",
        invoiceDate: "",
        recursosHidricos: 0,
        consumptionValue: 0,
        sewageValue: 0,
        totalDays: 0,
        consumptionMinimo: 0,
      });
    }
  }

  return { contas, unidades, warnings, errors };
}
