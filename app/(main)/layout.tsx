import { ResponsiveNavigation, ResponsivePadding } from "@/components/responsive-navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { PermissionsProvider } from "./PermissionsContext";
import { ResidentGuard } from "@/components/resident-guard";


export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <PermissionsProvider>
            <ResidentGuard>
                <SidebarProvider>
                    <ResponsiveNavigation />
                    <main className="overflow-hidden pt-8 md:w-full">
                        {children}
                        <Toaster />
                    </main>
                    <ResponsivePadding />
                </SidebarProvider>
            </ResidentGuard>
        </PermissionsProvider>
    );
}
