import * as React from "react"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader } from "@/components/ui/sidebar"
import { FooterSidebar } from "./footer-sidebar"
import { usePermissionsContext } from "@/app/(main)/PermissionsContext"
import { sidebarPermissionMap } from './sidebar-permission-map';
import { items as sidebarItems, type ItemType } from "./app-sidebar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import axios from "axios";

export function MobileSidebarDrawer({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { permissions } = usePermissionsContext();
  const [canViewUsersByContext, setCanViewUsersByContext] = React.useState(false);
  const [hasApartmentVisualizationFallback, setHasApartmentVisualizationFallback] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function resolveUsersVisibility() {
      try {
        const res = await axios.get('/api/auth/my-context', { withCredentials: true });
        const data = res.data as {
          isSystem?: boolean;
          isRestrictedManager?: boolean;
          apartments?: Array<{ id: string }>;
          blocks?: Array<{ id: string }>;
          complexes?: Array<{ id: string }>;
          companyIds?: string[];
        };
        const hasManagerScope =
          !!data?.isSystem ||
          !!data?.isRestrictedManager ||
          (data?.companyIds?.length || 0) > 0 ||
          (data?.complexes?.length || 0) > 0 ||
          (data?.blocks?.length || 0) > 0;
        const hasApartmentScope = (data?.apartments?.length || 0) > 0;
        const hasOnlyApartmentScope = !hasManagerScope && hasApartmentScope;
        if (!cancelled) {
          setCanViewUsersByContext(hasManagerScope && !hasOnlyApartmentScope);
          setHasApartmentVisualizationFallback(hasApartmentScope);
        }
      } catch {
        if (!cancelled) {
          setCanViewUsersByContext(false);
          setHasApartmentVisualizationFallback(false);
        }
      }
    }
    resolveUsersVisibility();
    return () => { cancelled = true; };
  }, []);

  function hasAnyPermission(url: string, requiresCreate?: boolean, requiresRead?: boolean) {
    if (url === '/users' && canViewUsersByContext) return true;
    if (
      hasApartmentVisualizationFallback &&
      ['/readings', '/meter-report', '/levantamento', '/apartment-report', '/dashboard'].includes(url)
    ) {
      return true;
    }
    if (url === '/dashboard') return true;
    if (!permissions) return false;
    const entity = sidebarPermissionMap[url];
    if (!entity) return permissions.length > 0;
    if (requiresCreate) {
      return permissions.some((p: any) => p.entity === entity && p.action === 'create');
    }
    if (requiresRead) {
      return permissions.some((p: any) => p.entity === entity && p.action === 'read');
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
        hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresRead)
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
                            hasAnyPermission(item.url, (item as any).requiresCreate, (item as any).requiresRead)
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
