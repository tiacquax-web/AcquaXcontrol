import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { useUserContext } from "@/hooks/useUserContext"
import { Skeleton } from "@/components/ui/skeleton"

import {
  CircleGauge, Building2, Building, DoorClosed,
  Gauge, ShieldCheck, HousePlus, ReceiptText,
  ChartBarIncreasing, LayoutDashboard, GaugeCircle,
  Radio, UsersRound, Droplets, FileText, TrendingUp, BookOpen, ClipboardList,
  MessageSquare, Lightbulb, Key, DatabaseZap, BellDot, Settings,
} from "lucide-react"
import Image from "next/image"
import { sidebarPermissionMap } from './sidebar-permission-map';
import { RolePreviewSelector } from './RolePreviewSelector';
import { useRolePreview, ROLE_LABELS } from '@/contexts/RolePreviewContext';
import { getRoleTabVisibility } from '@/lib/role-tab-config';

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
    requiresGL: true,
  },
  {
    title: "Central de Alertas",
    url: "/alerts",
    icon: BellDot,
    group: 'Geral',
    requiresGL: true,
  },
  {
    title: "Medidores de Nível",
    url: "/reservoir-monitoring",
    icon: Droplets,
    group: 'Geral',
    requiresGL: true,
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
    title: "GroupLink (GL)",
    url: "/gl-integration",
    icon: DatabaseZap,
    group: 'Cadastros',
    requiresCreate: true, // Somente admins/programador (entity=system)
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
  {
    title: "Personalização de Perfis",
    url: "/role-customization",
    icon: Settings,
    group: 'Cadastros',
    requiresCreate: true,
  },
]

export function AppSidebar() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { permissions, loading } = usePermissionsContext();
  const { context: userContext, loading: ctxLoading } = useUserContext();

  // ── Role Preview Mode ──
  const { isPreviewing, previewRole, effectivePermissions: previewPerms } = useRolePreview();

  // Determina o tipo de role do usuário real (para aplicar config de abas)
  const realRoleType = (() => {
    if (!userContext) return null;
    if (userContext.isSystem) {
      if (userContext.systemRoles?.includes('Administrador')) return 'administrador';
      return 'programador';
    }
    // Não é system
    if (userContext.companyIds.length === 0 && userContext.complexes.length === 0 && userContext.blocks.length === 0 && userContext.apartments.length > 0) {
      return 'morador';
    }
    // Tem complexes/blocks mas não company → sindico
    if (userContext.companyIds.length === 0 && (userContext.complexes.length > 0 || userContext.blocks.length > 0)) {
      return 'sindico';
    }
    // Tem companyIds → administradora
    if (userContext.companyIds.length > 0) {
      return 'administradora';
    }
    return 'sindico'; // fallback
  })();

  // Verifica se o usuário tem condomínios com medidores GL vinculados
  const hasGLAccess = (() => {
    if (!userContext) return false;
    // No modo real, se for sistema, tem acesso a tudo
    if (!isPreviewing && userContext.isSystem) return true;
    // No modo preview ou real comum, checa se tem condomínios GL
    return userContext.glComplexIds && userContext.glComplexIds.length > 0;
  })();

  function hasAnyPermission(url: string, requiresCreate?: boolean, requiresGL?: boolean) {
    // Dashboard sempre visível
    if (url === '/dashboard') return true;

    // ── Preview mode: usa permissões simuladas + config de abas ──
    if (isPreviewing && previewPerms) {
      // Primeiro checa se a aba está habilitada na config personalizada
      const tabVisible = getRoleTabVisibility(url, previewRole as any);
      if (tabVisible === false) return false;

      if (requiresGL && !hasGLAccess) {
        return false;
      }
      const entity = sidebarPermissionMap[url];
      if (!entity) return previewPerms.length > 0;
      if (entity === 'system' && requiresCreate) {
        return previewPerms.some((p: any) => p.entity === 'system');
      }
      if (requiresCreate) {
        return previewPerms.some((p: any) => p.entity === entity && p.action === 'create');
      }
      return previewPerms.some((p: any) => p.entity === entity);
    }

    // ── Modo real ──
    if (!permissions) return false;

    // Aplicar config de abas personalizada para usuários reais
    if (realRoleType) {
      const tabVisible = getRoleTabVisibility(url, realRoleType);
      if (tabVisible === false) return false;
    }

    if (requiresGL) {
      if (!hasGLAccess) return false;
    }

    const entity = sidebarPermissionMap[url];
    if (!entity) return permissions.length > 0;
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
      (item) => item.group === group && hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresGL)
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
        <RolePreviewSelector />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleGroups.map((group) => (
                  <div key={group}>
                    <SidebarGroupLabel>
                      {group}
                      <div className="border-t-2 border-gray-200 ml-3 w-full" />
                    </SidebarGroupLabel>
                    {items
                      .filter(
                        (item) =>
                          item.group === group &&
                          hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresGL)
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
