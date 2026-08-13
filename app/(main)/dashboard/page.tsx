// ─── MoradorDashboard ─────────────────────────────────────────────────────────
function MoradorDashboard({ router }: { router: ReturnType<typeof useRouter> }) {
  const { isPreviewing, effectiveContext: previewCtx } = useRolePreview();
  const { context: realCtx, loading: realLoading } = useUserContext();
  const context = isPreviewing ? previewCtx : realCtx;
  const ctxLoading = isPreviewing ? false : realLoading;
  const apartments = context?.apartments ?? [];

  const singleApartment = useMemo(() => {
    if (!context || apartments.length !== 1) return null;
    return apartments[0];
  }, [context, apartments]);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const activeAptId = singleApartment?.id ?? selectedAptId;

  // Buscar relatórios de consumo do morador para exibir dados mesmo sem GL IoT
  const currentMonthOpt = allMonthOptions[0];
  const { data: reportData, loading: reportLoading } = useMeterReport({
    month: currentMonthOpt.month,
    year: currentMonthOpt.year,
    apartmentId: activeAptId ?? undefined,
    enabled: !!activeAptId,
  });

  if (ctxLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const userReport = reportData?.list?.[0] ?? null;

  return (
    <div className="space-y-6">
      {!singleApartment && apartments.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {apartments.map((apt: any) => {
            const block = apt.block as any;
            const cx = block?.complex;
            return (
              <Button
                key={apt.id}
                variant={selectedAptId === apt.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedAptId(apt.id)}
                className="flex items-center gap-1.5 text-xs"
              >
                <DoorClosed className="w-3.5 h-3.5" />
                {cx?.socialName ? `${cx.socialName} — ` : ''}Bl.{block?.name} Apto {apt.name}
              </Button>
            );
          })}
        </div>
      )}

      {apartments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl p-6 bg-card">
          <Home className="w-10 h-10 mx-auto mb-3 opacity-40 text-blue-500" />
          <p className="font-semibold text-foreground">Nenhum apartamento vinculado à sua conta.</p>
          <p className="text-xs mt-1">Entre em contato com a administração do seu condomínio para vincular sua unidade.</p>
        </div>
      )}

      {activeAptId && (
        <>
          <ResidentMonitoringCard apartmentId={activeAptId} />

          {/* Card de Resumo de Consumo do Mês (Fallback / Garantia) */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                Meu Consumo — {currentMonthOpt.labelShort}
              </CardTitle>
              <MonthSelect value={currentMonthOpt.value} onChange={() => {}} />
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : userReport ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/40 border">
                  <div>
                    <p className="text-xs text-muted-foreground">Consumo de Água</p>
                    <p className="text-xl font-bold text-teal-600 mt-0.5">{userReport.consumption?.toFixed(2) ?? '0.00'} m³</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor da Unidade</p>
                    <p className="text-xl font-bold text-blue-600 mt-0.5">{formatCurrency(userReport.totalUnit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Leitura Final</p>
                    <p className="text-base font-semibold mt-1">{userReport.lastReading?.reading?.toFixed(3) ?? '—'} m³</p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Link href={`/apartment-report/${userReport.id}`}>
                      <Button size="sm" className="gap-1.5 text-xs">
                        Ver Filipeta Completa <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <Droplets className="w-8 h-8 mx-auto mb-2 opacity-30 text-teal-500" />
                  <p>Nenhum relatório de consumo fechado para {currentMonthOpt.labelShort}.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!activeAptId && apartments.length > 1 && (
        <p className="text-xs text-muted-foreground text-center py-8">Selecione uma unidade acima para ver o monitoramento.</p>
      )}
    </div>
  );
}
