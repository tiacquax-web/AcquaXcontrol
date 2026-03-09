'use client';

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Route, ClipboardList, CheckCircle2, Clock, AlertTriangle,
  Building2, Camera, TrendingUp, ArrowRight, RefreshCw,
  FileWarning, Send, CalendarX, Eye, Flame,
} from "lucide-react";
import { useUserContext } from "@/hooks/useUserContext";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH_LABEL = `${MONTHS[CURRENT_MONTH - 1]} / ${CURRENT_YEAR}`;

interface FieldStats {
  // Leituras
  leituras_agendadas: number;
  leituras_aguardando: number;
  leituras_realizadas: number;
  leituras_digitadas: number;
  leituras_atencao: number;
  // Condomínios
  condominios_conferidos: number;
  condominios_aguardando_conta: number;
  condominios_finalizados: number;
  condominios_enviados: number;
  condominios_total: number;
  // Raw OS list for attention
  os_atencao: Array<{ id: string; orderNumber: string; complexName: string; motivo: string }>;
}

interface PendingMonth {
  month: number;
  year: number;
  label: string;
  nao_finalizados: number;
  nao_lidos: number;
  nao_enviados: number;
}

function StatCard({
  title, value, icon: Icon, color, href, sublabel
}: {
  title: string; value: number | string; icon: any;
  color: string; href?: string; sublabel?: string;
}) {
  const content = (
    <Card className={`border-l-4 ${color} hover:shadow-md transition-shadow cursor-pointer`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-opacity-10`}>
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export default function FieldDashboard() {
  const { user } = useUserContext();
  const [stats, setStats] = useState<FieldStats | null>(null);
  const [pending, setPending] = useState<PendingMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch routes for current month
      const [routesRes, ordersRes, complexesRes] = await Promise.all([
        fetch(`/api/reading-routes?month=${CURRENT_MONTH}&year=${CURRENT_YEAR}&take=200`),
        fetch(`/api/service-orders?month=${CURRENT_MONTH}&year=${CURRENT_YEAR}&take=500`),
        fetch(`/api/(public)/user/(places)/complexes?take=200&status=Ativo`),
      ]);

      const routesData = routesRes.ok ? await routesRes.json() : { data: [] };
      const ordersData = ordersRes.ok ? await ordersRes.json() : { data: [] };
      const complexesData = complexesRes.ok ? await complexesRes.json() : { data: [] };

      const routes: any[] = routesData.data || [];
      const orders: any[] = ordersData.data || [];
      const totalComplexes: number = (complexesData.data || complexesData || []).length;

      // ── Leituras ──────────────────────────────────────────────────────
      const leituras_agendadas = routes.filter((r: any) =>
        ["DRAFT", "ACTIVE"].includes(r.status)
      ).length;
      const leituras_aguardando = routes.filter((r: any) => r.status === "DRAFT").length;
      const leituras_realizadas = orders.filter((o: any) => o.status === "COMPLETED").length;
      const leituras_digitadas = orders.filter((o: any) =>
        ["COMPLETED", "REVIEWED"].includes(o.status)
      ).length;

      // Atenção: consumo > 25m³ ou foto não processada
      const os_atencao: any[] = [];
      orders.forEach((o: any) => {
        const items: any[] = o.serviceOrderItems || [];
        const highConsumption = items.some((i: any) =>
          i.consumption != null && i.consumption > 25
        );
        const unreadPhoto = items.some((i: any) =>
          i.photoUrl && i.status === "ERROR"
        );
        if (highConsumption || unreadPhoto) {
          os_atencao.push({
            id: o.id,
            orderNumber: o.orderNumber,
            complexName: o.complexSocialName || "—",
            motivo: highConsumption ? "Consumo alto (>25m³)" : "Foto não processada",
          });
        }
      });

      // ── Condomínios ──────────────────────────────────────────────────
      const condominios_conferidos = routes.filter((r: any) =>
        ["IN_PROGRESS", "COMPLETED"].includes(r.status)
      ).length;
      const condominios_aguardando_conta = routes.filter((r: any) =>
        r.status === "COMPLETED" && !r.accountUploaded
      ).length;
      const condominios_finalizados = routes.filter((r: any) =>
        r.status === "COMPLETED" && r.accountUploaded
      ).length;
      const condominios_enviados = routes.filter((r: any) =>
        r.status === "SENT"
      ).length;

      setStats({
        leituras_agendadas,
        leituras_aguardando,
        leituras_realizadas,
        leituras_digitadas,
        leituras_atencao: os_atencao.length,
        condominios_conferidos,
        condominios_aguardando_conta,
        condominios_finalizados,
        condominios_enviados,
        condominios_total: totalComplexes,
        os_atencao,
      });

      // ── Pendências meses anteriores ────────────────────────────────────
      const pendingMonths: PendingMonth[] = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(CURRENT_YEAR, CURRENT_MONTH - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        try {
          const pRes = await fetch(`/api/reading-routes?month=${m}&year=${y}&take=200`);
          if (!pRes.ok) continue;
          const pData = await pRes.json();
          const pRoutes: any[] = pData.data || [];
          if (pRoutes.length === 0) continue;
          const nao_finalizados = pRoutes.filter((r: any) =>
            !["COMPLETED", "SENT"].includes(r.status)
          ).length;
          const nao_lidos = pRoutes.filter((r: any) => r.status === "DRAFT").length;
          const nao_enviados = pRoutes.filter((r: any) =>
            r.status === "COMPLETED" && !r.sentAt
          ).length;
          if (nao_finalizados > 0 || nao_lidos > 0 || nao_enviados > 0) {
            pendingMonths.push({
              month: m, year: y,
              label: `${MONTHS[m - 1]} / ${y}`,
              nao_finalizados, nao_lidos, nao_enviados,
            });
          }
        } catch { /* ignore */ }
      }
      setPending(pendingMonths);
      setLastUpdate(new Date());
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="w-full p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Panorama Geral — Campo</h1>
          <p className="text-muted-foreground text-sm">
            {CURRENT_MONTH_LABEL} &nbsp;·&nbsp;
            Atualizado às {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="h-4 bg-muted rounded animate-pulse mb-2 w-2/3" />
                <div className="h-8 bg-muted rounded animate-pulse w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats && (
        <>
          {/* ── Seção Leituras ──────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Leituras — {CURRENT_MONTH_LABEL}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                title="Agendadas" value={stats.leituras_agendadas}
                icon={Route} color="border-l-blue-400" href="/reading-routes"
              />
              <StatCard
                title="Aguard. Agendamento" value={stats.leituras_aguardando}
                icon={Clock} color="border-l-yellow-400" href="/reading-routes"
                sublabel="Status: Rascunho"
              />
              <StatCard
                title="Realizadas" value={stats.leituras_realizadas}
                icon={CheckCircle2} color="border-l-green-400" href="/service-orders"
              />
              <StatCard
                title="Digitadas" value={stats.leituras_digitadas}
                icon={TrendingUp} color="border-l-sky-400" href="/service-orders"
              />
              <Link href="/service-orders">
                <Card className={`border-l-4 border-l-red-400 hover:shadow-md transition-shadow cursor-pointer ${stats.leituras_atencao > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precisando Atenção</p>
                        <p className={`text-3xl font-bold mt-1 ${stats.leituras_atencao > 0 ? "text-red-600" : ""}`}>
                          {stats.leituras_atencao}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Consumo &gt;25m³ ou foto não lida</p>
                      </div>
                      <AlertTriangle className={`h-6 w-6 mt-1 ${stats.leituras_atencao > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>

          {/* ── Seção Condomínios ─────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Condomínios — {CURRENT_MONTH_LABEL}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Conferidos" value={stats.condominios_conferidos}
                icon={Eye} color="border-l-indigo-400" href="/service-orders"
              />
              <StatCard
                title="Aguardando Conta" value={stats.condominios_aguardando_conta}
                icon={Clock} color="border-l-orange-400" href="/service-orders"
                sublabel="Aguardando conta da distribuidora"
              />
              <StatCard
                title="Finalizados" value={stats.condominios_finalizados}
                icon={CheckCircle2} color="border-l-green-500" href="/generate-spreadsheets"
              />
              <StatCard
                title="Enviados" value={stats.condominios_enviados}
                icon={Send} color="border-l-teal-400" href="/generate-spreadsheets"
              />
            </div>
          </section>

          {/* ── Alertas de Atenção ─────────────────────────────── */}
          {stats.os_atencao.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-red-500 mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4" /> Ordens Precisando Atenção
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {stats.os_atencao.slice(0, 6).map((os) => (
                  <Link key={os.id} href={`/service-orders/${os.id}`}>
                    <Card className="border border-red-200 dark:border-red-800 hover:shadow-md transition-shadow">
                      <CardContent className="pt-3 pb-3 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{os.complexName}</p>
                          <p className="text-xs text-muted-foreground">{os.orderNumber} · {os.motivo}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Pendências meses anteriores ──────────────────── */}
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-amber-600 mb-3 flex items-center gap-2">
                <CalendarX className="h-4 w-4" /> Pendências de Meses Anteriores
              </h2>
              <div className="space-y-3">
                {pending.map((p) => (
                  <Card key={`${p.month}-${p.year}`} className="border border-amber-200 dark:border-amber-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <CalendarX className="h-5 w-5 text-amber-500" />
                          <span className="font-semibold text-sm">{p.label}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {p.nao_lidos > 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <FileWarning className="h-3 w-3" />
                              {p.nao_lidos} condomínio{p.nao_lidos > 1 ? "s" : ""} não lido{p.nao_lidos > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {p.nao_finalizados > 0 && (
                            <Badge variant="outline" className="border-amber-400 text-amber-600 gap-1">
                              <Clock className="h-3 w-3" />
                              {p.nao_finalizados} não finalizado{p.nao_finalizados > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {p.nao_enviados > 0 && (
                            <Badge variant="outline" className="border-orange-400 text-orange-600 gap-1">
                              <Send className="h-3 w-3" />
                              {p.nao_enviados} não enviado{p.nao_enviados > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="sm:ml-auto">
                          <Link href={`/reading-routes?month=${p.month}&year=${p.year}`}>
                            <Button variant="outline" size="sm">
                              Ver <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {pending.length === 0 && !loading && (
            <Card className="border border-green-200 dark:border-green-900">
              <CardContent className="pt-4 pb-4 flex items-center gap-3 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Sem pendências nos meses anteriores 🎉</span>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
