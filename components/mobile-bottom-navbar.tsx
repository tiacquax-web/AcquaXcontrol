import * as React from "react"
import { HomeIcon as House, BarChartIcon as ChartBarStackedIcon, Home, Inbox, Search, Calendar, Handshake, MessageSquareIcon, MessageSquareDot, BarChart4, CircleGauge, Newspaper, HardHat, LayoutDashboard, ChartBarIncreasing, ReceiptText, Menu, Droplets } from 'lucide-react'
import { MobileSidebarDrawer } from "./mobile-sidebar-drawer"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { sidebarPermissionMap } from "./sidebar-permission-map"
import { Skeleton } from "@/components/ui/skeleton"

// TODO: Create modal sidebar and add three dots icon to open it.
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { label: "Relatórios", href: "/apartment-report", icon: ChartBarIncreasing, group: 'Geral' },
  { label: "Contas", href: "/dealership-readings", icon: ReceiptText, group: 'Geral' },
  { icon: CircleGauge, label: "Leituras", href: "/readings", },
  { icon: Newspaper, label: "Novidades", href: "/blog/post-1" },
  { icon: HardHat, label: "Serviços", href: "/solutions", },
]

export function MobileBottomNavbar() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const { permissions, loading } = usePermissionsContext();
  // Função igual ao sidebar
  function hasAnyPermission(url: string) {
    if (url === '/dashboard' || url === '/solutions') return true;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return true;
    return permissions.some((p: any) => p.entity === entity);
  }
  // Itens principais
  const mainNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: ChartBarIncreasing, label: "Relatórios", href: "/apartment-report" },
    { icon: CircleGauge, label: "Leituras", href: "/readings" },
    { icon: Droplets, label: "Reservatórios", href: "/reservoir-monitoring" },
    { icon: HardHat, label: "Serviços", href: "/solutions" },
  ].filter((item) => hasAnyPermission(item.href));
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
        <ul className="flex justify-around items-center h-16">
          {loading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <li key={idx}>
                <div className="flex flex-col items-center justify-center w-full h-full">
                  <Skeleton className="h-6 w-6 mb-1" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </li>
            ))
          ) : (
            mainNavItems.slice(0, 5).map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-foreground"
                >
                  <item.icon className="h-6 w-6" />
                  <span className="text-xs mt-1">{item.label}</span>
                </a>
              </li>
            ))
          )}
          <li>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-foreground focus:outline-none"
              aria-label="Abrir menu completo"
              type="button"
            >
              <Menu className="h-6 w-6" />
              <span className="text-xs mt-1">Mais</span>
            </button>
          </li>
        </ul>
      </nav>
      <MobileSidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}