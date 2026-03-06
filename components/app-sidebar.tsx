import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { Skeleton } from "@/components/ui/skeleton"

import { Calendar, BarChart4, Newspaper, HardHat, CircleGauge, Building2, Building, DoorClosed, BookUser, Gauge, Users, ShieldCheck, HousePlus, Receipt, ReceiptText, NotepadText, BarChart2, ChartBarIncreasing, LayoutDashboard, GaugeCircle, Power, Radio, SquareUserIcon, Briefcase, BriefcaseBusiness, UsersRound, Droplets } from "lucide-react"
import Image from "next/image"
import { sidebarPermissionMap } from './sidebar-permission-map';

// Menu items.
const items = [
  {
    title: "Início",
    url: "/dashboard",
    icon: LayoutDashboard,
    group: 'Geral'
  },
  {
    title: "Relatórios",
    url: "/apartment-report",
    icon: ChartBarIncreasing,
    group: 'Geral'
  },
  {
    title: "Contas",
    url: "/dealership-readings",
    icon: ReceiptText,
    group: 'Geral'
  },
  {
    title: "Leituras",
    url: "/readings",
    icon: CircleGauge,
    group: 'Geral'
  },
  {
    title: "Monitoramento",
    url: "/monitoring",
    icon: Gauge,
    group: 'Geral'
  },
  {
    title: "Medidores de Nível",
    url: "/reservoir-monitoring",
    icon: Droplets,
    group: 'Geral'
  },
  {
    title: "Agenda",
    url: "/calendar",
    icon: Calendar,
    group: 'Geral'
  },
  {
    title: "Novidades",
    url: "/blog/post-1",
    icon: Newspaper,
    group: 'Geral'
  },
  {
    title: "Serviços",
    url: "/solutions",
    icon: HardHat,
    group: 'Geral'
  },
  {
    title: "Administradoras",
    url: "/companies",
    icon: HousePlus,
    group: 'Cadastros'
  },
  {
    title: "Condomínios",
    url: "/complexes",
    icon: Building2,
    group: 'Cadastros'
  },
  {
    title: "Blocos",
    url: "/blocks",
    icon: Building,
    group: 'Cadastros'
  },
  {
    title: "Apartamentos",
    url: "/apartments",
    icon: DoorClosed,
    group: 'Cadastros'
  },
  {
    title: "Medidores",
    url: "/meters",
    icon: GaugeCircle,
    group: 'Cadastros'
  },
  {
    title: "IOTs",
    url: "/devices",
    icon: Radio,
    group: 'Cadastros'
  },
  {
    title: "Reservatórios",
    url: "/reservoirs",
    icon: Droplets,
    group: 'Cadastros'
  },
  // {
  //   title: "Moradores",
  //   url: "/residents",
  //   icon: SquareUserIcon,
  //   group: 'Cadastros'
  // },
  // {
  //   title: "Síndicos",
  //   url: "/syndics",
  //   icon: BriefcaseBusiness,
  //   group: 'Cadastros'
  // },
  {
    title: "Usuários",
    url: "/users",
    icon: UsersRound,
    group: 'Cadastros'
  },
  {
    title: "Papéis",
    url: "/roles",
    icon: ShieldCheck,
    group: 'Cadastros'
  }
]

export function AppSidebar() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { permissions, loading } = usePermissionsContext();

  // Função para checar permissão de leitura
  function hasAnyPermission(url: string) {
    console.log('Checking permissions for URL:', url);
    if (url === '/dashboard' || url === '/solutions') return true; // Dashboard e Serviços sempre disponíveis
    if (!permissions || !permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return true; // Se não mapeado, mostra
    return permissions.some(
      (p: any) => p.entity === entity
    );
  }

  const groups = items.reduce<string[]>((acc, item) => {
    if (!acc.includes(item.group)) {
      acc.push(item.group);
    }
    return acc;
  }, []);

  // Filtra grupos que possuem pelo menos um item visível
  const visibleGroups = groups.filter((group) =>
    items.some((item) => item.group === group && hasAnyPermission(item.url))
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
                    <SidebarGroupLabel key={group}>
                      {group}
                      <div className="border-t-2 border-gray-200 ml-3 w-full"></div>
                    </SidebarGroupLabel>
                    {items.filter((item) => item.group === group && hasAnyPermission(item.url)).map((item) => (
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

// Exporta o tipo dos itens para uso em outros componentes
type ItemType = typeof items[number];
export type { ItemType };
export { items };

