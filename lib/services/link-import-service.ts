import prisma from '@/lib/prisma';

// Tipos compartilhados
export interface LinkImportRow {
  DEVICE_ID: string;
  BLOCO: string;
  UNIDADE: string;
  CONDOMINIO: string;
  INICIO: string;
  FIM?: string;
  CHASSI?: string;
}

export interface LinkImportValidationError {
  row: number;
  field: string;
  message: string;
  type: 'error' | 'warning';
}

export interface LinkImportValidationResult {
  isValid: boolean;
  errors: LinkImportValidationError[];
  warnings: LinkImportValidationError[];
  processedRows: number;
  validRows: number;
}

export interface LinkImportProcessResult {
  success: boolean;
  createdLinks: number;
  createdLinkIds: string[];  // 🆕 IDs dos vínculos criados
  devicesForReprocessing: string[];
  metersForReprocessing: string[];
  errors: string[];
  details?: string;
}

/**
 * Serviço responsável por validar e processar planilhas de vínculos Device -> Meter.
 * Centraliza a lógica que antes estava duplicada entre duas rotas.
 */
export class LinkImportService {
  /** Valida linhas de importação */
  static async validate(rows: LinkImportRow[]): Promise<LinkImportValidationResult> {
    const errors: LinkImportValidationError[] = [];
    const warnings: LinkImportValidationError[] = [];
    let validRows = 0;

    const deviceIds = [...new Set(rows.map(r => r.DEVICE_ID).filter(Boolean))];
    const condominios = [...new Set(rows.map(r => r.CONDOMINIO).filter(Boolean))];
    const chassiNumbers = [...new Set(rows.map(r => r.CHASSI).filter((c): c is string => Boolean(c)))]

    const [devices, complexes, chassiMeters, activeLinks] = await Promise.all([
      prisma.iotDevice.findMany({
        where: { deviceId: { in: deviceIds }, deletedAt: null },
        select: { deviceId: true }
      }),
      prisma.complex.findMany({
        where: { socialName: { in: condominios }, deletedAt: null },
        include: {
          blocks: { where: { deletedAt: null }, include: { apartments: { where: { deletedAt: null }, include: { meters: { where: { deletedAt: null, status: 'Ativo' }, select: { id: true, register: true } } } } } }
        }
      }),
      chassiNumbers.length ? prisma.meter.findMany({
        where: { register: { in: chassiNumbers } },
        select: { id: true, register: true, apartment: { select: { name: true, block: { select: { name: true, complex: { select: { socialName: true } } } } } } }
      }) : [],
      prisma.meterDeviceLink.findMany({
        where: { deviceId: { in: deviceIds }, deletedAt: null, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
        select: { deviceId: true, startDate: true, endDate: true }
      })
    ]);

    const deviceMap = new Map(devices.map(d => [d.deviceId, d]));
    const complexMap = new Map(complexes.map(c => [c.socialName.toLowerCase(), c]));
    const chassiMap = new Map(chassiMeters.map(m => [m.register.toUpperCase(), m]));
    const activeLinkMap = new Map(activeLinks.map(l => [l.deviceId, l]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      let ok = true;

      const mandatory: Array<keyof LinkImportRow> = ['DEVICE_ID', 'CONDOMINIO', 'BLOCO', 'UNIDADE', 'INICIO'];
      for (const field of mandatory) {
        if (!row[field]?.toString().trim()) {
          errors.push({ row: rowNum, field, message: `${field} é obrigatório`, type: 'error' });
          ok = false;
        }
      }
      if (!ok) continue;

      const device = deviceMap.get(row.DEVICE_ID);
      if (!device) {
        errors.push({ row: rowNum, field: 'DEVICE_ID', message: `Dispositivo '${row.DEVICE_ID}' não encontrado`, type: 'error' });
        ok = false;
      }

      const complex = complexMap.get(row.CONDOMINIO.toLowerCase());
      if (!complex) {
        errors.push({ row: rowNum, field: 'CONDOMINIO', message: `Condomínio '${row.CONDOMINIO}' não encontrado`, type: 'error' });
        ok = false;
      }
      const block = complex?.blocks.find(b => b.name.toLowerCase() === row.BLOCO.toLowerCase());
      if (complex && !block) {
        errors.push({ row: rowNum, field: 'BLOCO', message: `Bloco '${row.BLOCO}' não encontrado no condomínio`, type: 'error' });
        ok = false;
      }
      const apartment = block?.apartments.find(a => a.name.toLowerCase() === row.UNIDADE.toLowerCase());
      if (block && !apartment) {
        errors.push({ row: rowNum, field: 'UNIDADE', message: `Apartamento '${row.UNIDADE}' não encontrado`, type: 'error' });
        ok = false;
      }

      if (apartment) {
        if (apartment.meters.length > 1 && !row.CHASSI?.trim()) {
          errors.push({ row: rowNum, field: 'CHASSI', message: 'CHASSI obrigatório quando há múltiplos medidores', type: 'error' });
          ok = false;
        }
        if (row.CHASSI?.trim() && !apartment.meters.some(m => m.register.toUpperCase() === row.CHASSI!.toUpperCase())) {
          errors.push({ row: rowNum, field: 'CHASSI', message: `Chassi '${row.CHASSI}' não encontrado no apartamento`, type: 'error' });
          ok = false;
        }
      }

      let start: Date | undefined;
      let end: Date | undefined;
      try { start = new Date(row.INICIO); if (isNaN(start.getTime())) throw 0; } catch { errors.push({ row: rowNum, field: 'INICIO', message: `Data inválida '${row.INICIO}'`, type: 'error' }); ok = false; }
      if (row.FIM?.trim()) {
        try { end = new Date(row.FIM); if (isNaN(end.getTime())) throw 0; if (start && end <= start) { throw new Error('fim <= início'); } } catch { errors.push({ row: rowNum, field: 'FIM', message: `Data fim inválida '${row.FIM}'`, type: 'error' }); ok = false; }
      }

      if (device && ok) {
        const active = activeLinkMap.get(device.deviceId);
        if (active) {
          const existingEnd = active.endDate || undefined;
            const newStart = start!;
            const newEnd = end || new Date('9999-12-31');
            if (!existingEnd || (newStart < existingEnd && newEnd > active.startDate)) {
              errors.push({ row: rowNum, field: 'DEVICE_ID', message: `Dispositivo já possui vínculo ativo no período`, type: 'error' });
              ok = false;
            }
        }
      }

      if (ok) validRows++;
    }

    return { isValid: errors.length === 0, errors, warnings, processedRows: rows.length, validRows };
  }

  /** Processa criação dos vínculos assumindo que já passaram por validação */
  static async process(rows: LinkImportRow[], userId: string): Promise<LinkImportProcessResult> {
    const errors: string[] = [];
    const devicesForReprocessing: string[] = [];
    const metersForReprocessing: string[] = [];
    let createdLinks = 0;

    const [devicesMap, apartmentsMap] = await Promise.all([
      this.getDevicesMap(rows.map(r => r.DEVICE_ID)),
      this.getApartmentsMap(rows)
    ]);

    const linksToCreate: { deviceId: string; meterId: string; startDate: Date; endDate: Date | null; createdByUserId: string; deletedAt: null }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const device = devicesMap.get(row.DEVICE_ID);
        if (!device) throw new Error(`Dispositivo '${row.DEVICE_ID}' não encontrado`);
        const apartmentKey = `${row.CONDOMINIO.toLowerCase()}|${row.BLOCO.toLowerCase()}|${row.UNIDADE.toLowerCase()}`;
        const apartment = apartmentsMap.get(apartmentKey);
        if (!apartment) throw new Error(`Apartamento não encontrado: ${row.CONDOMINIO}/${row.BLOCO}/${row.UNIDADE}`);

        let targetMeter: any;
        if (row.CHASSI?.trim()) {
          targetMeter = apartment.meters.find((m: any) => m.register.toUpperCase() === row.CHASSI!.toUpperCase());
          if (!targetMeter) throw new Error(`Chassi '${row.CHASSI}' não encontrado no apartamento`);
        } else {
          if (apartment.meters.length === 0) throw new Error('Nenhum medidor ativo encontrado no apartamento');
          if (apartment.meters.length > 1) throw new Error('Múltiplos medidores, CHASSI obrigatório');
          targetMeter = apartment.meters[0];
        }

        const startDate = new Date(row.INICIO);
        const endDate = row.FIM?.trim() ? new Date(row.FIM) : null;

        const conflict = device.meterDeviceLinks.some((l: any) => l.deletedAt === null && (!l.endDate || new Date(l.endDate) > startDate));
        if (conflict) throw new Error('Dispositivo já possui vínculo ativo conflitante');

        linksToCreate.push({ deviceId: device.deviceId, meterId: targetMeter.id, startDate, endDate, createdByUserId: userId, deletedAt: null });
        createdLinks++;
        if (!devicesForReprocessing.includes(device.deviceId)) devicesForReprocessing.push(device.deviceId);
        if (!metersForReprocessing.includes(targetMeter.register)) metersForReprocessing.push(targetMeter.register);
      } catch (e: any) {
        errors.push(`Linha ${rowNum}: ${e.message || e}`);
      }
    }

    if (errors.length) return { success: false, createdLinks: 0, createdLinkIds: [], devicesForReprocessing: [], metersForReprocessing: [], errors };

    // 🆕 Modificação: usar create individual para obter IDs ao invés de createMany
    const createdLinkIds: string[] = [];
    if (linksToCreate.length) {
      console.log(`🔗 Criando ${linksToCreate.length} vínculos individuais para capturar IDs...`);
      
      const createPromises = linksToCreate.map(linkData => 
        prisma.meterDeviceLink.create({
          data: linkData,
          select: { id: true }  // Só retorna o ID
        })
      );
      
      const createdResults = await Promise.all(createPromises);
      createdLinkIds.push(...createdResults.map(r => r.id));
      
      console.log(`✅ Vínculos criados com IDs: ${createdLinkIds.slice(0, 3).join(', ')}${createdLinkIds.length > 3 ? '...' : ''}`);
    }

    const details = `Vínculos criados: ${createdLinks}\nDispositivos: ${devicesForReprocessing.length}\nMedidores: ${metersForReprocessing.length}`;

    return { success: true, createdLinks, createdLinkIds, devicesForReprocessing, metersForReprocessing, errors: [], details };
  }

  private static async getDevicesMap(deviceIds: string[]): Promise<Map<string, any>> {
    const uniqueIds = [...new Set(deviceIds.filter(Boolean))];
    const devices = await prisma.iotDevice.findMany({
      where: { deviceId: { in: uniqueIds }, deletedAt: null },
      select: { id: true, deviceId: true, meterDeviceLinks: { where: { deletedAt: null }, select: { id: true, startDate: true, endDate: true, deletedAt: true } } }
    });
    return new Map(devices.map(d => [d.deviceId, d]));
  }

  private static async getApartmentsMap(rows: LinkImportRow[]): Promise<Map<string, any>> {
    const condominios = [...new Set(rows.map(r => r.CONDOMINIO.toLowerCase()))];
    const apartments = await prisma.apartment.findMany({
      where: { block: { complex: { socialName: { in: condominios, mode: 'insensitive' }, deletedAt: null }, deletedAt: null }, deletedAt: null },
      select: { id: true, name: true, block: { select: { id: true, name: true, complex: { select: { id: true, socialName: true } } } }, meters: { where: { deletedAt: null, status: 'Ativo' }, select: { id: true, register: true } } }
    });
    const map = new Map();
    apartments.forEach(a => {
      if (!a.block?.complex) return;
      const key = `${a.block.complex.socialName.toLowerCase()}|${a.block.name.toLowerCase()}|${a.name.toLowerCase()}`;
      map.set(key, a);
    });
    return map;
  }
}
