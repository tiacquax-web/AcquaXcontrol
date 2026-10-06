import { ResponsiveNavigation, ResponsivePadding } from "@/components/responsive-navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { PermissionsProvider } from "./PermissionsContext";
import { RolePreviewProvider } from "@/contexts/RolePreviewContext";
import { PrintHeader } from "@/components/print-header";


export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <RolePreviewProvider>
            <PermissionsProvider>
                <SidebarProvider>
                    <ResponsiveNavigation />
                    <main className="overflow-hidden pt-8 md:w-full">
                        {/* Cabeçalho oficial (logo AcquaX) — visível apenas na impressão */}
                        <PrintHeader />
                        {children}
                        <Toaster />
                    </main>
                    <ResponsivePadding />
                </SidebarProvider>
            </PermissionsProvider>
        </RolePreviewProvider>
    );
}
