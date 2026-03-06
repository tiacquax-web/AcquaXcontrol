"use client";
import { ChevronUp, User, User2 } from "lucide-react";
import { SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "./ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import ThemeSwitcher from "./theme-switcher";
import { Separator } from "./ui/separator";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function FooterSidebar() {

    const {user, error, loading} = useCurrentUser();

    function signOut() {
        console.log("Signing out...");
        fetch("/api/auth/logout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        }).then(() => {
            window.location.href = "/";
        }).catch((error) => {
            console.error("Error during sign out:", error);
        });
    }
    return (
        <SidebarFooter>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton>
                                <User2 />{" "}
                                {user?.name
                                    ? user.name
                                          .split(" ")
                                          .slice(0, 3)
                                          .map((word, idx) =>
                                              idx === 2 && word.length > 2
                                                  ? word.slice(0, 3) + "..."
                                                  : word
                                          )
                                          .join(" ")
                                    : "..."}
                                <ChevronUp className="ml-auto" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="top"
                            className="w-[--radix-popper-anchor-width]"
                        >
                            <DropdownMenuItem className="py-0">
                                <a href="/account" className="w-full h-full py-1.5 flex items-center gap-2">
                                    <User /><span>Minha Conta</span>
                                </a>
                            </DropdownMenuItem>
                            {/* <DropdownMenuItem className="py-0">
                                <span className="w-full h-full py-1.5">Billing</span>
                            </DropdownMenuItem> */}
                            <Separator />
                            <DropdownMenuItem className="py-0">
                                <ThemeSwitcher />
                            </DropdownMenuItem>
                            <Separator />
                            <DropdownMenuItem className="py-0 cursor-pointer" onClick={signOut}>
                                <span className="w-full h-full py-1.5">Sair</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    );
}