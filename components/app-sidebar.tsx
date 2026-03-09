import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { Skeleton } from "@/components/ui/skeleton"

import {
  LayoutDashboard, Route, ClipboardList, Camera,
  FileSpreadsheet, FilePlus2,
  Building2, Building, DoorClosed,
  GaugeCircle, UsersRound, ShieldCheck, HousePlus,
} from "lucide-react"
import Image from "next/image"
import { sidebarPermissionMap } from './sidebar-permission-map';

// ─── Menu items do AcquaX Field ──────────────────────────────────────────────
const items = [
  // ── Operação — visível para todos os usuários logados ──
  {
    title: "Início",
    url: "/dashboard",
    icon: LayoutDashboard,
    group: 'Operação',
    alwaysVisible: true,
  },
  {
    title: "Rotas de Leitura",
    url: "/reading-routes",
    icon: Route,
    group: 'Operação',
    alwaysVisible: true,
  },
  {
    title: "Ordens de Serviço",
    url: "/service-orders",
    icon: ClipboardList,
    group: 'Operação',
    alwaysVisible: true,
  },
  {
    title: "Fotos",
    url: "/photos",
    icon: Camera,
    group: 'Operação',
    alwaysVisible: true,
  },

  // ── Faturamento — visível para todos os usuários logados ──
  {
    title: "Modelos de Planilha",
    url: "/spreadsheet-templates",
    icon: FileSpreadsheet,
    group: 'Faturamento',
    alwaysVisible: true,
  },
  {
    title: "Gerar Planilhas",
    url: "/generate-spreadsheets",
    icon: FilePlus2,
    group: 'Faturamento',
    alwaysVisible: true,
  },

  // ── Cadastros ──
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
    title: "Usuários",
    url: "/users",
    icon: UsersRound,
    group: 'Cadastros',
    requiresCreate: true,
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

  function hasAnyPermission(url: string, requiresCreate?: boolean, alwaysVisible?: boolean) {
    // Itens marcados como alwaysVisible aparecem para qualquer usuário logado
    if (alwaysVisible) return Array.isArray(permissions) ? permissions.length >= 0 : true;
    if (url === '/dashboard') return true;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return permissions.length > 0;
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
      (item) => item.group === group && hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).alwaysVisible)
    )
  );

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "icon"}>
      <SidebarHeader className="flex items-start justify-between py-4">
        <div>
          <Image
            src="/logo-acquax.png"
            alt="Acqua X do Brasil"
            width={220}
            height={44}
            className="mb-1"
            priority
          />
          <div className="pl-1 text-xs font-bold tracking-widest text-sky-500 uppercase">Field</div>
        </div>
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
                    {Array.from({ length: 4 }).map((_, i) => (
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
                          hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).alwaysVisible)
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
