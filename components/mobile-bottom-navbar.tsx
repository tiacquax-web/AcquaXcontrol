import * as React from "react"
import { LayoutDashboard, Route, ClipboardList, Camera, Menu } from 'lucide-react'
import { MobileSidebarDrawer } from "./mobile-sidebar-drawer"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { sidebarPermissionMap } from "./sidebar-permission-map"
import { Skeleton } from "@/components/ui/skeleton"

export function MobileBottomNavbar() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const { permissions, loading } = usePermissionsContext();

  function hasAnyPermission(url: string) {
    if (url === '/dashboard') return true;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return permissions.length > 0;
    return permissions.some((p: any) => p.entity === entity);
  }

  // 4 itens principais no bottom bar + botão "Mais"
  const mainNavItems = [
    { icon: LayoutDashboard, label: "Início", href: "/dashboard" },
    { icon: Route, label: "Rotas", href: "/reading-routes" },
    { icon: ClipboardList, label: "Ordens", href: "/service-orders" },
    { icon: Camera, label: "Fotos", href: "/photos" },
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
            mainNavItems.slice(0, 4).map((item) => (
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
