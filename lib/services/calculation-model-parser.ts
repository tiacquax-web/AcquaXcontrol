/**
 * calculation-model-parser.ts
 *
 * Lê uma planilha Excel (.xlsx) e extrai automaticamente o modelo de cálculo:
 * - Faixas de tarifa (N faixas progressivas)
 * - % Esgoto
 * - Tipo de rateio de Área Comum
 * - Carro-pipa
 * - Colunas extras (taxa admin, honorários, etc.)
 *
 * Retorna um objeto CalculationModelDraft pronto para revisão do operador.
 */

import * as XLSX from 'xlsx'
import JSZip from 'jszip'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TariffTier {
  limitM3: number | null   // null = última faixa (sem limite superior)
  pricePerM3: number
  label: string            // ex: "0 – 15 m³", "> 15 m³"
}

export type CommonAreaType =
  | 'NONE'
  | 'EQUAL'
  | 'FRACTION'
  | 'PROPORTIONAL'
  | 'INVERSE_PROPORTIONAL'

export interface ExtraColumn {
  name: string
  type: 'FIXED_PER_UNIT' | 'PERCENT_TOTAL' | 'EQUAL_SPLIT' | 'FRACTION'
  value?: number
  description: string
}

export interface CalculationModelDraft {
  detectedCondominiumName: string
  sourceFileName: string

  tariffTiers: TariffTier[]
  tariffMode: 'SINGLE' | 'PROGRESSIVE' | 'MINIMUM_PLUS_PROGRESSIVE'

  sewagePercent: number
  sewageFormula: string

  commonAreaType: CommonAreaType
  commonAreaFormula: string

  kiteCarEnabled: boolean
  kiteCarType?: 'PER_UNIT' | 'PROPORTIONAL'

  extraColumns: ExtraColumn[]

  autoDescription: string
  warnings: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: any): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function getCellValue(wb: XLSX.WorkBook, sheetName: string, addr: string): any {
  const ws = wb.Sheets[sheetName]
  if (!ws) return null
  const cell = ws[addr]
  return cell ? (cell.v ?? null) : null
}

async function extractArrayFormulas(buffer: Buffer): Promise<Record<string, string>> {
  const formulas: Record<string, string> = {}
  try {
    const zip = await JSZip.loadAsync(buffer)
    const sheetFiles = Object.keys(zip.files).filter(f =>
      f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml')
    )
    for (const sf of sheetFiles) {
      const xml = await zip.file(sf)!.async('string')
      const re = /<c r="([^"]+)"[^>]*><f[^>]*>([^<]+)<\/f>/g
      let m
      while ((m = re.exec(xml)) !== null) {
        if (!formulas[m[1]]) formulas[m[1]] = m[2]
      }
    }
  } catch (_) {}
  return formulas
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export async function parseCalculationModel(
  buffer: Buffer,
  fileName: string
): Promise<CalculationModelDraft> {
  const warnings: string[] = []
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true })

  // Detectar abas
  const infoSheet = wb.SheetNames.find(n => n.toUpperCase().includes('INFORM')) ?? null
  const medicaoSheet = wb.SheetNames.find(n => {
    const u = n.toUpperCase()
    return (u.includes('MEDI') || u.includes('SISTEMA')) && !u.includes('ANUAL')
  }) ?? null

  if (!infoSheet) warnings.push('Aba INFORMAÇÕES não encontrada.')
  if (!medicaoSheet) warnings.push('Aba MEDIÇÃO/SISTEMA não encontrada.')

  // ── 1. Nome do condomínio ──────────────────────────────────────────────────
  let condominiumName = ''
  if (infoSheet) {
    const b2 = getCellValue(wb, infoSheet, 'B2')
    if (b2) condominiumName = String(b2).trim()
  }

  // ── 2. Tarifas ─────────────────────────────────────────────────────────────
  const tariffTiers: TariffTier[] = []
  let tariffMode: 'SINGLE' | 'PROGRESSIVE' | 'MINIMUM_PLUS_PROGRESSIVE' = 'SINGLE'

  if (infoSheet) {
    const ws = wb.Sheets[infoSheet]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z100')
    const maxRow = Math.min(range.e.r + 1, 60)

    // Montar grid
    const grid: any[][] = []
    for (let r = 0; r < maxRow; r++) {
      const row: any[] = []
      for (let c = 0; c <= Math.min(range.e.c, 15); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        row.push(cell ? (cell.v ?? null) : null)
      }
      grid.push(row)
    }

    // Procurar linha com "TARIFAÇÃO" ou padrão "0 - 15"
    let tarifRow = -1
    for (let r = 0; r < maxRow; r++) {
      const a = String(grid[r]?.[0] || '').toUpperCase()
      const e = String(grid[r]?.[4] || '').toUpperCase()
      if (a.includes('TARIF') || e.includes('TARIF')) { tarifRow = r; break }
    }

    if (tarifRow === -1) {
      // Tentar B26/B27 diretamente (padrão comum das planilhas)
      const b26 = toNum(getCellValue(wb, infoSheet, 'B26'))
      const b27Cell = ws['B27']
      const b27Value = toNum(b27Cell?.v)
      const b27Formula = b27Cell?.f || ''

      if (b26 > 0) {
        const isSame = b27Formula.includes('B26') || b27Value === b26 || b27Value === 0
        if (isSame) {
          tariffTiers.push({ limitM3: null, pricePerM3: b26, label: 'Tarifa única' })
          tariffMode = 'SINGLE'
        } else {
          tariffTiers.push({ limitM3: 15, pricePerM3: b26, label: '0 – 15 m³' })
          tariffTiers.push({ limitM3: null, pricePerM3: b27Value, label: '> 15 m³' })
          tariffMode = 'PROGRESSIVE'
        }
      }
    } else {
      for (let r = tarifRow; r < Math.min(tarifRow + 12, maxRow); r++) {
        const labelA = String(grid[r]?.[0] || '').trim()
        const valB = grid[r]?.[1]
        if (!labelA || valB == null) continue
        const numB = toNum(valB)
        if (numB <= 0) continue

        let limitM3: number | null = null
        if (!labelA.includes('>') && !labelA.toUpperCase().startsWith('ACIMA')) {
          const nums = labelA.match(/(\d+)/g)
          if (nums && nums.length >= 2) limitM3 = parseInt(nums[1])
          else if (nums?.length === 1) limitM3 = parseInt(nums[0])
        }
        tariffTiers.push({ limitM3, pricePerM3: numB, label: labelA })
      }

      tariffMode = tariffTiers.length <= 1 ? 'SINGLE' : 'PROGRESSIVE'
    }

    if (tariffTiers.length === 0) {
      warnings.push('Não foi possível detectar as tarifas automaticamente.')
    }
  }

  // ── 3. Esgoto ──────────────────────────────────────────────────────────────
  let sewagePercent = 0
  if (infoSheet) {
    const ws = wb.Sheets[infoSheet]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z100')
    const maxRow = Math.min(range.e.r + 1, 60)
    const grid: any[][] = []
    for (let r = 0; r < maxRow; r++) {
      const row: any[] = []
      for (let c = 0; c <= Math.min(range.e.c, 8); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        row.push(cell ? (cell.v ?? null) : null)
      }
      grid.push(row)
    }

    let valAgua = 0, valEsgoto = 0
    for (let r = 0; r < maxRow; r++) {
      const e = String(grid[r]?.[4] || '').toUpperCase()
      if (e.includes('ÁGUA') && e.includes('VALOR')) valAgua = toNum(grid[r]?.[5])
      if (e.includes('ESGOTO') && e.includes('VALOR')) valEsgoto = toNum(grid[r]?.[5])
    }
    if (valAgua > 0 && valEsgoto > 0) {
      sewagePercent = Math.round((valEsgoto / valAgua) * 100)
    }
  }

  // ── 4. Área Comum ──────────────────────────────────────────────────────────
  let commonAreaType: CommonAreaType = 'NONE'
  let commonAreaFormula = 'Sem rateio de área comum'

  const arrayFormulas = await extractArrayFormulas(buffer)
  const lFormulas: string[] = []

  if (medicaoSheet) {
    const ws = wb.Sheets[medicaoSheet]
    for (let r = 15; r <= 25; r++) {
      const cell = ws[`L${r}`]
      if (cell?.f) lFormulas.push(cell.f)
    }
  }
  // Adicionar do array formula scan
  Object.entries(arrayFormulas)
    .filter(([ref]) => ref.match(/^L(1[5-9]|2[0-5])$/))
    .forEach(([, f]) => lFormulas.push(f))

  const lStr = lFormulas.join(' ').toUpperCase()

  if (lFormulas.length === 0 || lFormulas.every(f => !f)) {
    commonAreaType = 'NONE'
    commonAreaFormula = 'Sem rateio de área comum'
  } else if (lStr.includes('X') || lStr.includes('FRAC') || lStr.includes('COEF')) {
    commonAreaType = 'FRACTION'
    commonAreaFormula = 'Rateio por fração ideal (coeficiente por unidade)'
  } else if (lStr.includes('INVERSE') || lStr.includes('INVERSO')) {
    commonAreaType = 'INVERSE_PROPORTIONAL'
    commonAreaFormula = 'Rateio inversamente proporcional ao consumo'
  } else {
    // Checar se todas as fórmulas têm o mesmo padrão
    const uniquePatterns = new Set(lFormulas.map(f => f.replace(/\d+/g, 'N')))
    if (uniquePatterns.size === 1 && !lStr.includes('G')) {
      commonAreaType = 'EQUAL'
      commonAreaFormula = 'Rateio igual entre todas as unidades'
    } else if (lStr.includes('G')) {
      commonAreaType = 'PROPORTIONAL'
      commonAreaFormula = 'Rateio proporcional ao consumo individual'
    } else {
      commonAreaType = 'FRACTION'
      commonAreaFormula = 'Rateio por fração ideal (coeficiente variável)'
    }
  }

  // ── 5. Carro-pipa ──────────────────────────────────────────────────────────
  let kiteCarEnabled = false
  let kiteCarType: CalculationModelDraft['kiteCarType']

  if (medicaoSheet) {
    const ws = wb.Sheets[medicaoSheet]
    const n16 = ws['N16']
    if (n16?.f) {
      kiteCarEnabled = true
      kiteCarType = n16.f.toUpperCase().includes('G') ? 'PROPORTIONAL' : 'PER_UNIT'
    }
  }

  // ── 6. Colunas extras ──────────────────────────────────────────────────────
  const extraColumns: ExtraColumn[] = []
  if (medicaoSheet) {
    const ws = wb.Sheets[medicaoSheet]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z300')
    const knownCols = new Set(['B','C','D','E','F','G','H','I','J','K','L','M','N'])
    const headerRow = 14

    for (let c = 13; c <= Math.min(range.e.c, 25); c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow, c })
      const cell = ws[addr]
      if (!cell?.v) continue
      const colLetter = XLSX.utils.encode_col(c)
      if (knownCols.has(colLetter)) continue
      const headerName = String(cell.v).trim()
      if (!headerName) continue

      const dataCell = ws[XLSX.utils.encode_cell({ r: 15, c })]
      const formula = dataCell?.f || ''
      let type: ExtraColumn['type'] = 'FIXED_PER_UNIT'
      if (formula.includes('/') && (formula.includes('F2') || formula.includes('COUNT'))) type = 'EQUAL_SPLIT'
      else if (formula.includes('*') && formula.includes('G')) type = 'PERCENT_TOTAL'
      else if (formula.toUpperCase().includes('X') || formula.toUpperCase().includes('FRAC')) type = 'FRACTION'

      extraColumns.push({
        name: headerName,
        type,
        value: dataCell?.v ? toNum(dataCell.v) : undefined,
        description: `Coluna detectada: "${headerName}"`,
      })
    }
  }

  // ── 7. Descritivo ──────────────────────────────────────────────────────────
  const lines: string[] = []

  if (tariffTiers.length === 1 && tariffTiers[0].limitM3 === null) {
    lines.push(`📊 Tarifa única: R$ ${tariffTiers[0].pricePerM3.toFixed(4)}/m³`)
  } else if (tariffTiers.length > 0) {
    const modeLabel = (tariffMode as string) === 'MINIMUM_PLUS_PROGRESSIVE' ? 'Mínimo + Progressividade' : 'Faixas progressivas'
    lines.push(`📊 ${modeLabel}:`)
    for (const t of tariffTiers) {
      lines.push(`   • ${t.label}: R$ ${t.pricePerM3.toFixed(4)}/m³`)
    }
  }

  lines.push(sewagePercent === 0 ? '🚰 Esgoto: não cobrado' : `🚰 Esgoto: ${sewagePercent}% do valor de água`)
  lines.push(`🏘️ Área Comum: ${commonAreaFormula}`)
  if (kiteCarEnabled) lines.push(`🚚 Carro-pipa: ativo (${kiteCarType === 'PROPORTIONAL' ? 'proporcional ao consumo' : 'igual por unidade'})`)
  for (const ec of extraColumns) lines.push(`➕ ${ec.name}: ${ec.description}`)

  // ── 8. Confiança ───────────────────────────────────────────────────────────
  let confidence: CalculationModelDraft['confidence'] = 'HIGH'
  if (tariffTiers.length === 0) confidence = 'LOW'
  else if (warnings.length > 0) confidence = 'MEDIUM'

  return {
    detectedCondominiumName: condominiumName,
    sourceFileName: fileName,
    tariffTiers,
    tariffMode,
    sewagePercent,
    sewageFormula: sewagePercent === 0 ? 'Não cobrado' : `${sewagePercent}% do valor água`,
    commonAreaType,
    commonAreaFormula,
    kiteCarEnabled,
    kiteCarType,
    extraColumns,
    autoDescription: lines.join('\n'),
    warnings,
    confidence,
  }
}
