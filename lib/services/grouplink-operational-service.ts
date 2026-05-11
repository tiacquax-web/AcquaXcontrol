import prisma from '@/lib/prisma';

const GROUPLINK_SOURCE = 'grouplink_batch';

export interface DeviceChassiImportRow {
  device_id: string;
  chassi: string;
  pilotMode?: boolean;
}

export interface DeviceChassiImportResult {
  created: Array<{ row: number; deviceId: string; chassi: string; meterId: string; action: string }>;
  updated: Array<{ row: number; deviceId: string; chassi: string; meterId: string; action: string }>;
  success: Array<{ row: number; deviceId: string; chassi: string; meterId: string; action: string }>;
  ignored: Array<{ row: number; deviceId: string; chassi: string; reason: string }>;
  conflicts: Array<{ row: number; deviceId: string; chassi: string; reason: string }>;
  errors: Array<{ row: number; deviceId: string; chassi: string; reason: string }>;
}

function normalizeDeviceId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeChassi(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export class GrouplinkOperationalService {
  static async importDevicesByChassi(
    rows: DeviceChassiImportRow[],
    options?: { pilotMode?: boolean; pilotComplexId?: string; updateExisting?: boolean },
  ): Promise<DeviceChassiImportResult> {
    const result: DeviceChassiImportResult = {
      created: [],
      updated: [],
      success: [],
      ignored: [],
      conflicts: [],
      errors: [],
    };

    const seenDeviceIds = new Set<string>();
    const normalizedRows = rows.map((row) => ({
      deviceId: normalizeDeviceId(row.device_id),
      chassi: normalizeChassi(row.chassi),
      pilotMode: row.pilotMode,
    }));

    const uniqueChassis = Array.from(new Set(normalizedRows.map((row) => row.chassi).filter(Boolean)));
    const uniqueDeviceIds = Array.from(new Set(normalizedRows.map((row) => row.deviceId).filter(Boolean)));

    const [meters, devices, activeLinks] = await Promise.all([
      prisma.meter.findMany({
        where: { register: { in: uniqueChassis }, deletedAt: null },
        select: {
          id: true,
          register: true,
          deviceIdIoT: true,
          complexId: true,
          companyId: true,
          apartment: {
            select: {
              block: {
                select: {
                  complexId: true,
                  complex: { select: { id: true } },
                },
              },
            },
          },
        },
      }),
      prisma.iotDevice.findMany({
        where: { deviceId: { in: uniqueDeviceIds }, deletedAt: null },
        select: { id: true, deviceId: true, pilotMode: true },
      }),
      prisma.meterDeviceLink.findMany({
        where: {
          deviceId: { in: uniqueDeviceIds },
          deletedAt: null,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        select: { id: true, deviceId: true, meterId: true },
      }),
    ]);

    const metersByChassi = new Map(meters.map((meter) => [meter.register, meter]));
    const devicesByDeviceId = new Map(devices.map((device) => [device.deviceId, device]));
    const activeLinkByDevice = new Map(activeLinks.map((link) => [link.deviceId, link]));

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];
      const normalized = normalizedRows[index];
      const deviceId = normalized.deviceId;
      const chassi = normalized.chassi;

      try {
        if (!deviceId) {
          result.errors.push({ row: rowNumber, deviceId, chassi, reason: 'device_id inválido' });
          continue;
        }
        if (!chassi) {
          result.errors.push({ row: rowNumber, deviceId, chassi, reason: 'chassi/código interno inválido' });
          continue;
        }
        if (seenDeviceIds.has(deviceId)) {
          result.conflicts.push({ row: rowNumber, deviceId, chassi, reason: 'device_id duplicado na planilha' });
          continue;
        }
        seenDeviceIds.add(deviceId);

        const meter = metersByChassi.get(chassi);

        if (!meter) {
          result.errors.push({ row: rowNumber, deviceId, chassi, reason: `chassi inexistente: ${chassi}` });
          continue;
        }

        const meterComplexId = meter.complexId || meter.apartment?.block?.complexId || meter.apartment?.block?.complex?.id;
        if (options?.pilotComplexId && meterComplexId !== options.pilotComplexId) {
          result.ignored.push({
            row: rowNumber,
            deviceId,
            chassi,
            reason: 'medidor fora do condomínio piloto selecionado',
          });
          continue;
        }

        const device = devicesByDeviceId.get(deviceId);

        const targetPilotMode = normalized.pilotMode ?? options?.pilotMode ?? false;
        const updateExisting = options?.updateExisting !== false;
        let createdDevice = false;
        let updatedDevice = false;
        let createdLink = false;
        let updatedMeterBinding = false;

        if (!device) {
          const created = await prisma.iotDevice.create({
            data: {
              deviceId,
              remoteId: deviceId,
              pilotMode: targetPilotMode,
            },
          });
          createdDevice = true;
          devicesByDeviceId.set(deviceId, { id: created.id, deviceId: created.deviceId, pilotMode: created.pilotMode });
        } else if (device.pilotMode !== targetPilotMode && updateExisting) {
          await prisma.iotDevice.update({
            where: { id: device.id },
            data: { pilotMode: targetPilotMode },
          });
          updatedDevice = true;
          devicesByDeviceId.set(deviceId, { ...device, pilotMode: targetPilotMode });
        }

        const activeLink = activeLinkByDevice.get(deviceId);

        if (activeLink && activeLink.meterId !== meter.id) {
          result.conflicts.push({
            row: rowNumber,
            deviceId,
            chassi,
            reason: 'duplicidade: device já vinculado a outro medidor ativo',
          });
          continue;
        }

        if (meter.deviceIdIoT && meter.deviceIdIoT !== deviceId && !updateExisting) {
          result.conflicts.push({
            row: rowNumber,
            deviceId,
            chassi,
            reason: `medidor ${chassi} já possui vínculo explícito (${meter.deviceIdIoT})`,
          });
          continue;
        }

        let action = 'updated-device';
        if (!activeLink) {
          const createdLinkEntity = await prisma.meterDeviceLink.create({
            data: {
              meterId: meter.id,
              deviceId,
              startDate: new Date(),
            },
          });
          activeLinkByDevice.set(deviceId, {
            id: createdLinkEntity.id,
            deviceId: createdLinkEntity.deviceId,
            meterId: createdLinkEntity.meterId,
          });
          createdLink = true;
          action = device ? 'linked-existing-device' : 'created-device-and-linked';
        } else {
          action = 'already-linked';
        }

        if (meter.deviceIdIoT !== deviceId) {
          await prisma.meter.update({
            where: { id: meter.id },
            data: { deviceIdIoT: deviceId },
          });
          metersByChassi.set(chassi, { ...meter, deviceIdIoT: deviceId });
          updatedMeterBinding = true;
        }

        const successEntry = {
          row: rowNumber,
          deviceId,
          chassi,
          meterId: meter.id,
          action,
        };
        result.success.push(successEntry);
        if (createdDevice || createdLink) {
          result.created.push(successEntry);
        } else if (updatedDevice || updatedMeterBinding) {
          result.updated.push(successEntry);
        } else {
          result.ignored.push({
            row: rowNumber,
            deviceId,
            chassi,
            reason: 'registro já estava atualizado',
          });
        }
      } catch (error) {
        result.errors.push({
          row: rowNumber,
          deviceId,
          chassi,
          reason: error instanceof Error ? error.message : 'erro desconhecido na importação',
        });
      }
    }

    return result;
  }

  static async bulkDeleteDevices(params: {
    ids?: string[];
    deviceIds?: string[];
    onlyPilot?: boolean;
    onlyUnlinked?: boolean;
    onlyWithoutReadings?: boolean;
    olderThanDays?: number;
  }): Promise<{
    matched: number;
    deletedDevices: number;
    deletedLinks: number;
    clearedMeterBindings: number;
  }> {
    const where: any = { deletedAt: null };
    if (params.ids?.length) where.id = { in: params.ids };
    if (params.deviceIds?.length) where.deviceId = { in: params.deviceIds };
    if (params.onlyPilot) where.pilotMode = true;

    if (params.olderThanDays && params.olderThanDays > 0) {
      const limitDate = new Date(Date.now() - params.olderThanDays * 24 * 60 * 60 * 1000);
      where.updatedAt = { lt: limitDate };
    }

    if (params.onlyUnlinked) {
      where.meterDeviceLinks = {
        none: {
          deletedAt: null,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
      };
    }

    if (params.onlyWithoutReadings) {
      where.Readings = {
        none: { deletedAt: null },
      };
    }

    const devices = await prisma.iotDevice.findMany({
      where,
      select: { id: true, deviceId: true },
    });

    if (!devices.length) {
      return { matched: 0, deletedDevices: 0, deletedLinks: 0, clearedMeterBindings: 0 };
    }

    const ids = devices.map((d) => d.id);
    const deviceIds = devices.map((d) => d.deviceId);

    const now = new Date();
    const [deletedDevicesResult, deletedLinksResult, meterBindingsResult] = await Promise.all([
      prisma.iotDevice.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: now },
      }),
      prisma.meterDeviceLink.updateMany({
        where: { deviceId: { in: deviceIds }, deletedAt: null },
        data: { deletedAt: now, endDate: now },
      }),
      prisma.meter.updateMany({
        where: { deviceIdIoT: { in: deviceIds }, deletedAt: null },
        data: { deviceIdIoT: null },
      }),
    ]);

    return {
      matched: devices.length,
      deletedDevices: deletedDevicesResult.count,
      deletedLinks: deletedLinksResult.count,
      clearedMeterBindings: meterBindingsResult.count,
    };
  }

  static async resetPilotEnvironment(params?: {
    complexId?: string;
    clearPilotFlags?: boolean;
  }): Promise<{
    pilotDevices: number;
    deletedReadings: number;
    deletedAnomalies: number;
    deletedLinks: number;
    clearedMeterBindings: number;
  }> {
    const pilotDevices = await prisma.iotDevice.findMany({
      where: { deletedAt: null, pilotMode: true },
      select: { id: true, deviceId: true },
    });

    if (!pilotDevices.length) {
      return {
        pilotDevices: 0,
        deletedReadings: 0,
        deletedAnomalies: 0,
        deletedLinks: 0,
        clearedMeterBindings: 0,
      };
    }

    const pilotDeviceIds = pilotDevices.map((d) => d.deviceId);

    let scopedDeviceIds = pilotDeviceIds;
    if (params?.complexId) {
      const scopedLinks = await prisma.meterDeviceLink.findMany({
        where: {
          deviceId: { in: pilotDeviceIds },
          deletedAt: null,
          meter: {
            deletedAt: null,
            OR: [
              { complexId: params.complexId },
              { apartment: { block: { complexId: params.complexId } } },
            ],
          },
        },
        select: { deviceId: true },
      });
      scopedDeviceIds = Array.from(new Set(scopedLinks.map((l) => l.deviceId)));
    }

    if (!scopedDeviceIds.length) {
      return {
        pilotDevices: 0,
        deletedReadings: 0,
        deletedAnomalies: 0,
        deletedLinks: 0,
        clearedMeterBindings: 0,
      };
    }

    const now = new Date();
    const [readingsResult, linksResult, meterBindingsResult] = await Promise.all([
      prisma.reading.updateMany({
        where: {
          deviceId: { in: scopedDeviceIds },
          source: GROUPLINK_SOURCE,
          deletedAt: null,
        },
        data: { deletedAt: now },
      }),
      prisma.meterDeviceLink.updateMany({
        where: { deviceId: { in: scopedDeviceIds }, deletedAt: null },
        data: { deletedAt: now, endDate: now },
      }),
      prisma.meter.updateMany({
        where: { deviceIdIoT: { in: scopedDeviceIds }, deletedAt: null },
        data: { deviceIdIoT: null },
      }),
    ]);

    const scopedMeters = await prisma.meter.findMany({
      where: {
        deletedAt: null,
        OR: [{ deviceIdIoT: { in: scopedDeviceIds } }, { meterDeviceLinks: { some: { deviceId: { in: scopedDeviceIds } } } }],
      },
      select: { id: true },
    });
    const meterIds = scopedMeters.map((m) => m.id);

    const anomaliesResult = meterIds.length
      ? await prisma.iotAnomalyEvent.updateMany({
          where: {
            meterId: { in: meterIds },
            source: GROUPLINK_SOURCE,
            deletedAt: null,
          },
          data: { deletedAt: now },
        })
      : { count: 0 };

    if (params?.clearPilotFlags !== false) {
      await prisma.iotDevice.updateMany({
        where: { deviceId: { in: scopedDeviceIds }, deletedAt: null },
        data: { pilotMode: false },
      });
      if (params?.complexId) {
        await prisma.complex.updateMany({
          where: { id: params.complexId, deletedAt: null },
          data: { pilotMode: false },
        });
      }
    }

    return {
      pilotDevices: scopedDeviceIds.length,
      deletedReadings: readingsResult.count,
      deletedAnomalies: anomaliesResult.count,
      deletedLinks: linksResult.count,
      clearedMeterBindings: meterBindingsResult.count,
    };
  }

  static async exportLinksReportCsv(): Promise<string> {
    const devices = await prisma.iotDevice.findMany({
      where: { deletedAt: null },
      include: {
        meterDeviceLinks: {
          where: {
            deletedAt: null,
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
          include: {
            meter: {
              include: {
                apartment: {
                  include: {
                    block: {
                      include: {
                        complex: true,
                      },
                    },
                  },
                },
              },
            },
          },
          take: 1,
          orderBy: { startDate: 'desc' },
        },
        Readings: {
          where: { deletedAt: null },
          orderBy: { readAt: 'desc' },
          take: 1,
          select: { readAtDate: true, source: true, reading: true },
        },
      },
      orderBy: { deviceId: 'asc' },
    });

    const header = [
      'device_id',
      'pilot_mode',
      'linked',
      'meter_id',
      'chassi',
      'apartment',
      'block',
      'complex',
      'company_id',
      'last_reading',
      'last_reading_date',
      'last_reading_source',
      'last_seen_date',
    ];

    const lines = [header.join(',')];
    for (const device of devices) {
      const activeLink = device.meterDeviceLinks[0];
      const meter = activeLink?.meter;
      const last = device.Readings[0];
      const row = [
        device.deviceId,
        device.pilotMode ? 'true' : 'false',
        activeLink ? 'true' : 'false',
        meter?.id || '',
        meter?.register || '',
        meter?.apartment?.name || '',
        meter?.apartment?.block?.name || '',
        meter?.apartment?.block?.complex?.socialName || '',
        meter?.companyId || meter?.apartment?.block?.complex?.companyId || '',
        last?.reading !== undefined && last?.reading !== null ? String(last.reading) : '',
        last?.readAtDate || '',
        last?.source || '',
        device.lastSeenDate || '',
      ];
      lines.push(row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }

    return lines.join('\n');
  }

  static async getObservabilitySummary() {
    const latestFiles = await prisma.storageFileProcessing.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        companyId: true,
        bucket: true,
        objectKey: true,
        trigger: true,
        correlationId: true,
        status: true,
        totalRows: true,
        insertedReadings: true,
        duplicateReadings: true,
        rowErrorsCount: true,
        durationMs: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        errorMessage: true,
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      importedReadings,
      importedAnomalies,
      linkedDevices,
      unlinkedDevices,
      importErrors,
      importSuccess,
      importedReadingsToday,
      importedAnomaliesToday,
      ingestionFailuresToday,
      latestAudits,
    ] =
      await Promise.all([
        prisma.reading.count({ where: { source: GROUPLINK_SOURCE, deletedAt: null } }),
        prisma.iotAnomalyEvent.count({ where: { source: GROUPLINK_SOURCE, deletedAt: null } }),
        prisma.iotDevice.count({
          where: {
            deletedAt: null,
            meterDeviceLinks: {
              some: { deletedAt: null, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
            },
          },
        }),
        prisma.iotDevice.count({
          where: {
            deletedAt: null,
            meterDeviceLinks: {
              none: { deletedAt: null, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
            },
          },
        }),
        prisma.storageFileProcessing.count({ where: { deletedAt: null, status: 'error' } }),
        prisma.storageFileProcessing.count({ where: { deletedAt: null, status: 'success' } }),
        prisma.reading.count({
          where: {
            source: GROUPLINK_SOURCE,
            deletedAt: null,
            createdAt: { gte: startOfToday },
          },
        }),
        prisma.iotAnomalyEvent.count({
          where: {
            source: GROUPLINK_SOURCE,
            deletedAt: null,
            createdAt: { gte: startOfToday },
          },
        }),
        prisma.storageFileProcessing.count({
          where: {
            deletedAt: null,
            status: 'error',
            createdAt: { gte: startOfToday },
          },
        }),
        prisma.adminActionAudit.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            userId: true,
            action: true,
            target: true,
            status: true,
            correlationId: true,
            createdAt: true,
          },
        }),
      ]);

    const durations = latestFiles
      .filter((f) => f.processedAt)
      .map((f) => (f.processedAt!.getTime() - f.createdAt.getTime()) / 1000)
      .filter((v) => Number.isFinite(v) && v >= 0);

    const avgDurationSec = durations.length
      ? Number((durations.reduce((acc, v) => acc + v, 0) / durations.length).toFixed(2))
      : 0;

    const timelineMap = new Map<
      string,
      {
        correlationId: string;
        trigger: string;
        startedAt: Date;
        finishedAt: Date;
        filesTotal: number;
        filesSuccess: number;
        filesError: number;
        totalRows: number;
        rowErrors: number;
        durationMs: number;
      }
    >();

    for (const file of latestFiles) {
      const key = file.correlationId || `processing-${file.id}`;
      const existing = timelineMap.get(key);
      const startedAt = file.createdAt;
      const finishedAt = file.processedAt || file.updatedAt;
      const durationMs = file.durationMs || 0;
      if (!existing) {
        timelineMap.set(key, {
          correlationId: key,
          trigger: file.trigger || 'manual',
          startedAt,
          finishedAt,
          filesTotal: 1,
          filesSuccess: file.status === 'success' ? 1 : 0,
          filesError: file.status === 'error' ? 1 : 0,
          totalRows: file.totalRows || 0,
          rowErrors: file.rowErrorsCount || 0,
          durationMs,
        });
      } else {
        existing.startedAt = existing.startedAt < startedAt ? existing.startedAt : startedAt;
        existing.finishedAt = existing.finishedAt > finishedAt ? existing.finishedAt : finishedAt;
        existing.filesTotal += 1;
        existing.filesSuccess += file.status === 'success' ? 1 : 0;
        existing.filesError += file.status === 'error' ? 1 : 0;
        existing.totalRows += file.totalRows || 0;
        existing.rowErrors += file.rowErrorsCount || 0;
        existing.durationMs += durationMs;
      }
    }

    const timeline = Array.from(timelineMap.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20);

    return {
      counters: {
        importedReadings,
        importedAnomalies,
        linkedDevices,
        unlinkedDevices,
        importErrors,
        importSuccess,
        avgIngestionDurationSec: avgDurationSec,
        importedReadingsToday,
        importedAnomaliesToday,
        ingestionFailuresToday,
      },
      latestFiles,
      timeline,
      latestAudits,
    };
  }

  static async getIngestionDetails(params: {
    processingId: string;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(params.take || 25, 1), 200);
    const skip = Math.max(params.skip || 0, 0);

    const processing = await prisma.storageFileProcessing.findFirst({
      where: { id: params.processingId, deletedAt: null },
      include: {
        errors: {
          where: { deletedAt: null },
          orderBy: { lineNumber: 'asc' },
          take,
          skip,
        },
        _count: {
          select: { errors: true },
        },
      },
    });

    if (!processing) {
      return null;
    }

    return {
      processing,
      pagination: {
        take,
        skip,
        total: processing._count.errors,
        hasMore: processing._count.errors > skip + take,
      },
    };
  }

  static async exportIngestionErrorsCsv(processingId: string): Promise<string | null> {
    const processing = await prisma.storageFileProcessing.findFirst({
      where: { id: processingId, deletedAt: null },
      select: {
        id: true,
        objectKey: true,
        correlationId: true,
        errors: {
          where: { deletedAt: null },
          orderBy: { lineNumber: 'asc' },
          select: {
            lineNumber: true,
            errorType: true,
            errorMessage: true,
            rawLine: true,
          },
        },
      },
    });

    if (!processing) return null;

    const lines = [
      ['processing_id', 'correlation_id', 'object_key', 'line_number', 'error_type', 'error_message', 'raw_line'].join(','),
    ];

    for (const error of processing.errors) {
      lines.push(
        [
          processing.id,
          processing.correlationId || '',
          processing.objectKey,
          String(error.lineNumber),
          error.errorType || '',
          error.errorMessage,
          error.rawLine || '',
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      );
    }

    return lines.join('\n');
  }
}
