"use client"

import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { AppSidebar } from "./app-sidebar"
import { MobileBottomNavbar } from "./mobile-bottom-navbar"
import { NotificationsButton } from "./notifications/notifications-button"

export function ResponsiveNavigation() {
  const isMobile = useMediaQuery("(max-width: 768px)")

  return (
    <>
      {isMobile ? <MobileBottomNavbar /> : <AppSidebar />}
      {/* <NotificationsButton /> */}
    </>
  )
}

export function ResponsivePadding() {
  return (
    <div className="h-28" />
  );
}
