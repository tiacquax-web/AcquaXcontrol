import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanWhere(obj: any): any {
    if (Array.isArray(obj)) {
        // Remove objetos vazios do array
        return obj.map(cleanWhere).filter(item =>
            item !== null && item !== undefined &&
            !(typeof item === 'object' && item !== null && Object.keys(item).length === 0)
        );
    } else if (typeof obj === 'object' && obj !== null) {
        const newObj: any = {};
        for (const key in obj) {
            if (obj[key] === undefined) continue;
            if (Array.isArray(obj[key]) && obj[key].length === 0) continue; // Remove arrays vazios
            const cleaned = cleanWhere(obj[key]);
            if (
                cleaned === undefined ||
                (typeof cleaned === 'object' && cleaned !== null && Object.keys(cleaned).length === 0)
            ) continue;
            newObj[key] = cleaned;
        }
        return newObj;
    }
    return obj;
}

export function buildValidOrConditions(conditions: any[]): any[] {
    return conditions.filter((condition) => {
        if (typeof condition !== "object" || condition === null) return false;

        // Verifica se a condição contém arrays vazios
        const hasEmptyArrays = JSON.stringify(condition).includes('"in":[]');
        return !hasEmptyArrays && Object.keys(condition).length > 0;
    });
}

export function cleanOrConditions(orConditions: any[]): any[] | undefined {
    const validConditions = buildValidOrConditions(orConditions);
    return validConditions.length > 0 ? validConditions : undefined;
}

export function buildOrConditions(contexts: any, hasSystemPermission: boolean): any[] | undefined {
    if (hasSystemPermission) return undefined;
    
    const orConditions: any[] = [];
    
    if (contexts.apartmentIds && contexts.apartmentIds.length > 0) {
        orConditions.push({ id: { in: contexts.apartmentIds } });
    }
    if (contexts.blockIds && contexts.blockIds.length > 0) {
        orConditions.push({ blockId: { in: contexts.blockIds } });
    }
    if (contexts.complexIds && contexts.complexIds.length > 0) {
        orConditions.push({ block: { complexId: { in: contexts.complexIds } } });
    }
    if (contexts.companyIds && contexts.companyIds.length > 0) {
        orConditions.push({ block: { complex: { companyId: { in: contexts.companyIds } } } });
    }
    
    return orConditions.length > 0 ? orConditions : undefined;
}

export function buildMeterOrConditions(contexts: any, hasSystemPermission: boolean): any[] | undefined {
    if (hasSystemPermission) return undefined;
    
    const orConditions: any[] = [];
    
    if (contexts.apartmentIds && contexts.apartmentIds.length > 0) {
        orConditions.push({ apartmentId: { in: contexts.apartmentIds } });
    }
    if (contexts.blockIds && contexts.blockIds.length > 0) {
        orConditions.push({ apartment: { blockId: { in: contexts.blockIds } } });
    }
    if (contexts.complexIds && contexts.complexIds.length > 0) {
        orConditions.push({ apartment: { block: { complexId: { in: contexts.complexIds } } } });
    }
    if (contexts.companyIds && contexts.companyIds.length > 0) {
        orConditions.push({ apartment: { block: { complex: { companyId: { in: contexts.companyIds } } } } });
    }
    
    return orConditions.length > 0 ? orConditions : undefined;
}

export function buildBlockOrConditions(contexts: any, hasSystemPermission: boolean): any[] | undefined {
    if (hasSystemPermission) return undefined;
    
    const orConditions: any[] = [];
    
    if (contexts.blockIds && contexts.blockIds.length > 0) {
        orConditions.push({ id: { in: contexts.blockIds } });
    }
    if (contexts.complexIds && contexts.complexIds.length > 0) {
        orConditions.push({ complexId: { in: contexts.complexIds } });
    }
    if (contexts.companyIds && contexts.companyIds.length > 0) {
        orConditions.push({ complex: { companyId: { in: contexts.companyIds } } });
    }
    
    return orConditions.length > 0 ? orConditions : undefined;
}

export function buildComplexOrConditions(contexts: any, hasSystemPermission: boolean): any[] | undefined {
    if (hasSystemPermission) return undefined;
    
    const orConditions: any[] = [];
    
    if (contexts.complexIds && contexts.complexIds.length > 0) {
        orConditions.push({ id: { in: contexts.complexIds } });
    }
    if (contexts.companyIds && contexts.companyIds.length > 0) {
        orConditions.push({ companyId: { in: contexts.companyIds } });
    }
    
    return orConditions.length > 0 ? orConditions : undefined;
}

export function buildCompanyOrConditions(contexts: any, hasSystemPermission: boolean): any[] | undefined {
    if (hasSystemPermission) return undefined;
    
    const orConditions: any[] = [];
    
    if (contexts.companyIds && contexts.companyIds.length > 0) {
        orConditions.push({ id: { in: contexts.companyIds } });
    }
    
    return orConditions.length > 0 ? orConditions : undefined;
}

/**
 * Converte data/hora do formato da importação IoT para Date
 * Suporta: "dd/mm/AAAA HH:mm:ss", números do Excel (serial date), e outros formatos
 * IMPORTANTE: Prioriza formato brasileiro (dd/mm/aaaa) sobre americano (mm/dd/aaaa)
 */
export function parseIotReadingDate(dateTimeInput: string | number): Date {
    if (!dateTimeInput && dateTimeInput !== 0) {
        throw new Error('Data/hora não informada');
    }
    
    // console.log(`Parsing date input: ${dateTimeInput} (type: ${typeof dateTimeInput})`);
    
    // Se for um número (serial date do Excel)
    if (typeof dateTimeInput === 'number') {
        return parseExcelSerialDate(dateTimeInput);
    }
    
    // Se for string, processa como antes
    const dateTimeString = String(dateTimeInput);
    
    // Verifica se é um número em formato string (serial date)
    const numericValue = parseFloat(dateTimeString);
    if (!isNaN(numericValue) && dateTimeString.trim() === numericValue.toString()) {
        return parseExcelSerialDate(numericValue);
    }
    
    // Remove espaços extras e normaliza
    const normalized = dateTimeString.trim().replace(/\s+/g, ' ');
    
    // Tenta diferentes formatos de string - PRIORIZANDO FORMATO BRASILEIRO
    const formats = [
        // Formatos brasileiros (dd/mm/aaaa) - PRIORIDADE
        { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/, format: 'dd/mm/aaaa hh:mm:ss' },
        { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})$/, format: 'dd/mm/aaaa hh:mm' },
        { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'dd/mm/aaaa' },
        
        // Formatos ISO (aaaa-mm-dd)
        { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/, format: 'aaaa-mm-dd hh:mm:ss' },
        { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, format: 'aaaa-mm-dd' },
        
        // Formatos americanos (mm/dd/aaaa) - ÚLTIMA OPÇÃO
        { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/, format: 'mm/dd/aaaa hh:mm:ss' },
    ];
    
    for (const { pattern, format } of formats) {
        const match = normalized.match(pattern);
        if (match) {
            let day, month, year, hour = '00', minute = '00', second = '00';
            
            if (format.startsWith('dd/mm')) {
                // Formato brasileiro: dd/mm/aaaa
                [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
                
                // Validação para formato brasileiro: se dia > 12 e mês <= 12, está correto
                const dayNum = parseInt(day);
                const monthNum = parseInt(month);
                
                if (dayNum > 12 && monthNum <= 12) {
                    // Claramente formato brasileiro
                    // console.log(`Detected Brazilian format: ${day}/${month}/${year}`);
                } else if (dayNum <= 12 && monthNum <= 12) {
                    // Ambíguo - assumir brasileiro (padrão do sistema)
                    // console.log(`Ambiguous date, assuming Brazilian format: ${day}/${month}/${year}`);
                } else if (dayNum <= 12 && monthNum > 12) {
                    // Claramente formato americano mal interpretado - trocar
                    // console.log(`Detected American format misinterpreted, swapping: ${month}/${day}/${year} -> ${day}/${month}/${year}`);
                    [day, month] = [month, day];
                }
                
            } else if (format.startsWith('aaaa-mm-dd')) {
                // Formato ISO: aaaa-mm-dd
                [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
            } else if (format.startsWith('mm/dd')) {
                // Formato americano: mm/dd/aaaa (só usar se explicitamente americano)
                [, month, day, year, hour = '00', minute = '00', second = '00'] = match;
                // console.log(`Using American format: ${month}/${day}/${year}`);
            }
            
            // Validação de valores
            const dayNum = parseInt(day!);
            const monthNum = parseInt(month!);
            const yearNum = parseInt(year!);
            
            if (dayNum < 1 || dayNum > 31) {
                throw new Error(`Dia inválido: ${day}`);
            }
            if (monthNum < 1 || monthNum > 12) {
                throw new Error(`Mês inválido: ${month}`);
            }
            if (yearNum < 1900 || yearNum > 2100) {
                throw new Error(`Ano inválido: ${year}`);
            }
            
            // Cria a data (mês é 0-indexado em JavaScript)
            const date = new Date(
                yearNum,
                monthNum - 1,
                dayNum,
                parseInt(hour!),
                parseInt(minute!),
                parseInt(second!)
            );
            
            // Valida se a data é válida
            if (isNaN(date.getTime())) {
                throw new Error(`Data inválida: ${dateTimeInput}`);
            }
            
            // Verifica se a data criada corresponde aos valores fornecidos
            if (date.getDate() !== dayNum || date.getMonth() !== monthNum - 1 || date.getFullYear() !== yearNum) {
                throw new Error(`Data inconsistente: ${dateTimeInput} resultou em ${date.toISOString()}`);
            }

            // console.log(`Parsed date: ${date.toISOString()} from input: ${dateTimeInput}`);
            
            return date;
        }
    }
    
    throw new Error(`Formato de data não reconhecido: ${dateTimeInput}`);
}

/**
 * Converte número serial do Excel para Date
 * Excel conta dias desde 1 de janeiro de 1900 (com bug do ano bissexto)
 */
function parseExcelSerialDate(serialDate: number): Date {
    // Excel considera 1900 como ano bissexto (erroneamente)
    // e conta a partir de 1 de janeiro de 1900
    const excelEpoch = new Date(1900, 0, 1); // 1 de janeiro de 1900
    
    // Corrige o bug do Excel (adiciona 1 dia se >= 60, que representa 29/02/1900)
    let correctedSerial = serialDate;
    if (serialDate >= 60) {
        correctedSerial = serialDate - 1;
    }
    
    // Calcula a data
    const date = new Date(excelEpoch.getTime() + (correctedSerial - 1) * 24 * 60 * 60 * 1000);
    
    // Valida se a data é válida
    if (isNaN(date.getTime())) {
        throw new Error(`Serial date inválido: ${serialDate}`);
    }
    
    // console.log(`Parsed Excel serial date ${serialDate} to: ${date.toISOString()}`);
    
    return date;
}

/**
 * Formata Date para o formato readAtDate (AAAA-MM-DD HH:mm:ss)
 */
export function formatReadingDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Formata Date para o formato de data simples (AAAA-MM-DD)
 */
export function formatSimpleDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Detecta automaticamente o tipo de data e converte para Date
 * Suporta: string, number (Excel serial), Date
 */
export function smartParseDate(input: any): Date {
    if (!input && input !== 0) {
        throw new Error('Data/hora não informada');
    }
    
    // Se já é uma instância de Date
    if (input instanceof Date) {
        if (isNaN(input.getTime())) {
            throw new Error('Data inválida fornecida');
        }
        return input;
    }
    
    // Se é string ou number, usa a função parseIotReadingDate
    return parseIotReadingDate(input);
}

/**
 * Converte valor para número, tratando diferentes tipos de entrada
 */
export function parseReadingValue(value: any): number {
    if (value === null || value === undefined || value === '') {
        throw new Error('Valor de leitura não informado');
    }
    
    // Se é string, substitui vírgula por ponto (formato brasileiro)
    if (typeof value === 'string') {
        value = value.replace(',', '.');
    }
    
    const numValue = Number(value);
    if (isNaN(numValue)) {
        throw new Error(`Valor de leitura inválido: ${value}`);
    }
    
    return numValue;
}

/**
 * Valida se uma data está no formato brasileiro analisando dia/mês
 */
function isBrazilianDateFormat(day: number, month: number): boolean {
    // Se dia > 12 e mês <= 12, claramente formato brasileiro
    if (day > 12 && month <= 12) return true;
    
    // Se mês > 12 e dia <= 12, claramente formato americano
    if (month > 12 && day <= 12) return false;
    
    // Se ambos <= 12, é ambíguo - assumir brasileiro (padrão do sistema)
    return true;
}

/**
 * Sanitizes a URL for use in Next.js Image component by encoding special characters.
 * Ensures the URL is properly formatted for stricter image components.
 * @param url The raw URL string.
 * @returns The encoded URL string.
 */
export function sanitizeImageUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  // encodeURI encodes most characters but preserves characters like /, ?, &, =, #
  // which are valid in a URI.
  // We use decodeURIComponent first to prevent double encoding if the URL is already partially encoded.
  // Then encodeURI to ensure it's fully encoded for next/image.
  try {
    const decodedUrl = decodeURIComponent(url);
    return encodeURI(decodedUrl);
  } catch (e) {
    console.error("Failed to sanitize URL, returning original:", url, e);
    return url; // Fallback to original if encoding fails
  }
}