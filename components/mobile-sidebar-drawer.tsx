import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { useUserContext } from "@/hooks/useUserContext"
import { sidebarPermissionMap } from './sidebar-permission-map';
import { items as sidebarItems, type ItemType } from "./app-sidebar"
import { Sheet, SheetContent } from "@/components/ui/sheet"

export function MobileSidebarDrawer({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { permissions } = usePermissionsContext();
  const { context: userContext } = useUserContext();

  // Só exibe abas de monitoramento em tempo real para quem tem GL/IoT
  const hasGLAccess = (() => {
    if (!userContext) return false;
    if (userContext.isSystem) return true;
    return (userContext.glComplexIds?.length ?? 0) > 0;
  })();

  function hasAnyPermission(url: string, requiresCreate?: boolean, requiresGL?: boolean) {
    if (url === '/dashboard') return true;
    if (requiresGL && !hasGLAccess) return false;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return permissions.length > 0;
    if (requiresCreate) {
      return permissions.some((p: any) => p.entity === entity && p.action === 'create');
    }
    return permissions.some((p: any) => p.entity === entity);
  }

  const groups = sidebarItems.reduce<string[]>((acc: string[], item: ItemType) => {
    if (!acc.includes(item.group)) acc.push(item.group);
    return acc;
  }, []);

  const visibleGroups = groups.filter((group: string) =>
    sidebarItems.some(
      (item: ItemType) =>
        item.group === group &&
        hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresGL)
    )
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 w-72 max-w-full">
        <Sidebar collapsible="none" className="h-full">
          <SidebarHeader className="flex items-start justify-between py-4">
            <img src="/logo-acquax.png" alt="Acqua X do Brasil" width={180} height={40} className="mb-3" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleGroups.map((group: string) => (
                    <div key={group}>
                      <SidebarGroupLabel>
                        {group}
                        <div className="border-t-2 border-gray-200 ml-3 w-full" />
                      </SidebarGroupLabel>
                      {sidebarItems
                        .filter(
                          (item: ItemType) =>
                            item.group === group &&
                            hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresGL)
                        )
                        .map((item: ItemType) => (
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
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <FooterSidebar />
        </Sidebar>
      </SheetContent>
    </Sheet>
  )
}
