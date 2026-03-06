import { ResponsiveNavigation, ResponsivePadding } from "@/components/responsive-navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { PermissionsProvider } from "./PermissionsContext";


export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <PermissionsProvider>
            <SidebarProvider>
                <ResponsiveNavigation />
                <main className="overflow-hidden pt-8 md:w-full">
                    {children}
                    <Toaster />
                </main>
                <ResponsivePadding />
            </SidebarProvider>
        </PermissionsProvider>
    );
}