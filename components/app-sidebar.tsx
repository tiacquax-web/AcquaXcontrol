import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { Skeleton } from "@/components/ui/skeleton"

import {
  CircleGauge, Building2, Building, DoorClosed,
  Gauge, ShieldCheck, HousePlus, ReceiptText,
  ChartBarIncreasing, LayoutDashboard, GaugeCircle,
  Radio, UsersRound, Droplets, FileText, TrendingUp, BookOpen, ClipboardList,
  MessageSquare, Lightbulb, Key,
} from "lucide-react"
import Image from "next/image"
import { sidebarPermissionMap } from './sidebar-permission-map';

// ─── Menu items ───────────────────────────────────────────────────────────────
// Regra: items sem requiresCreate aparecem para todos os perfis que têm
//        permissão de leitura na entidade mapeada.
//        Items com requiresCreate=true só aparecem para quem pode criar
//        (admin, programador, síndico com permissão total).
const items = [
  {
    title: "Início",
    url: "/dashboard",
    icon: LayoutDashboard,
    group: 'Geral',
  },
  {
    title: "Relatórios",
    url: "/apartment-report",
    icon: ChartBarIncreasing,
    group: 'Geral',
  },
  {
    title: "Contas",
    url: "/dealership-readings",
    icon: ReceiptText,
    group: 'Geral',
  },
  {
    title: "Leituras",
    url: "/readings",
    icon: CircleGauge,
    group: 'Geral',
  },
  {
    title: "Filipeta Medição",
    url: "/meter-report",
    icon: FileText,
    group: 'Geral',
  },
  {
    title: "Levantamento",
    url: "/levantamento",
    icon: TrendingUp,
    group: 'Geral',
  },
  {
    title: "Monitoramento",
    url: "/monitoring",
    icon: Gauge,
    group: 'Geral',
  },
  {
    title: "Medidores de Nível",
    url: "/reservoir-monitoring",
    icon: Droplets,
    group: 'Geral',
  },
  {
    title: "Apuração",
    url: "/apuracao",
    icon: ClipboardList,
    group: 'Geral',
    requiresCreate: true, // somente para quem tem permissão de criar condomínios (admin/programador)
  },
  {
    title: "Guia de Uso",
    url: "/guia",
    icon: BookOpen,
    group: 'Geral',
  },
  {
    title: "Suporte",
    url: "/suporte",
    icon: MessageSquare,
    group: 'Geral',
  },
  {
    title: "Sugestões",
    url: "/sugestoes",
    icon: Lightbulb,
    group: 'Geral',
  },
  {
    title: "API",
    url: "/api-manager",
    icon: Key,
    group: 'Integrações',
    requiresCreate: true, // Somente admins/gestores com permissão de criação
  },

  // ── Cadastros: só para perfis com permissão de criar ──
  {
    title: "Administradoras",
    url: "/companies",
    icon: HousePlus,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Condomínios",
    url: "/complexes",
    icon: Building2,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Blocos",
    url: "/blocks",
    icon: Building,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Apartamentos",
    url: "/apartments",
    icon: DoorClosed,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Medidores",
    url: "/meters",
    icon: GaugeCircle,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "IOTs",
    url: "/devices",
    icon: Radio,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Reservatórios",
    url: "/reservoirs",
    icon: Droplets,
    group: 'Cadastros',
    requiresCreate: true,
  },
  {
    title: "Usuários",
    url: "/users",
    icon: UsersRound,
    group: 'Cadastros',
    // sem requiresCreate, sem mapeamento em sidebarPermissionMap:
    // visível para qualquer usuário autenticado com qualquer permissão
    // (síndico, administradora, admin). Escopo de dados controlado pelo backend.
  },
  {
    title: "Papéis",
    url: "/roles",
    icon: ShieldCheck,
    group: 'Cadastros',
    requiresCreate: true,
  },
]

export function AppSidebar() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { permissions, loading } = usePermissionsContext();

  function hasAnyPermission(url: string, requiresCreate?: boolean) {
    // Dashboard sempre visível
    if (url === '/dashboard') return true;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    // URL sem mapeamento de entidade → visível se tiver qualquer permissão
    if (!entity) return permissions.length > 0;
    // Entidade 'system' com requiresCreate → visível para quem tem QUALQUER permissão
    // em 'system' (admin/programador têm entity=system em seus papéis)
    if (entity === 'system' && requiresCreate) {
      return permissions.some((p: any) => p.entity === 'system');
    }
    if (requiresCreate) {
      return permissions.some((p: any) => p.entity === entity && p.action === 'create');
    }
    return permissions.some((p: any) => p.entity === entity);
  }

  const groups = items.reduce<string[]>((acc, item) => {
    if (!acc.includes(item.group)) acc.push(item.group);
    return acc;
  }, []);

  const visibleGroups = groups.filter((group) =>
    items.some(
      (item) => item.group === group && hasAnyPermission(item.url, (item as any).requiresCreate)
    )
  );

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "icon"}>
      <SidebarHeader className="flex items-start justify-between py-4">
        <Image
          src="/logo-acquax.png"
          alt="Acqua X do Brasil"
          width={250}
          height={50}
          className="mb-3"
          priority
        />
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading ? (
                Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="mb-6">
                    <div className="flex items-center gap-2 mb-2 pl-2">
                      <Skeleton className="h-4 w-16 mb-2" />
                      <Skeleton className="h-2 w-full mb-2" />
                    </div>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2 pl-2">
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                visibleGroups.map((group) => (
                  <div key={group}>
                    <SidebarGroupLabel>
                      {group}
                      <div className="border-t-2 border-gray-200 ml-3 w-full" />
                    </SidebarGroupLabel>
                    {items
                      .filter(
                        (item) =>
                          item.group === group &&
                          hasAnyPermission(item.url, (item as any).requiresCreate)
                      )
                      .map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild tooltip={item.title}>
                            <a href={item.url}>
                              <item.icon />
                              <span>{item.title}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                  </div>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <FooterSidebar />
    </Sidebar>
  );
}

type ItemType = typeof items[number];
export type { ItemType };
export { items };
