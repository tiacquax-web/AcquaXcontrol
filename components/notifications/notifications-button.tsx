"use client"

import { useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { NotificationsList } from "./notifications-list"
import { Badge } from "@/components/ui/badge"
import { useNotifications } from "@/hooks/useNotifications"

export function NotificationsButton() {
  const { notifications, markAsRead } = useNotifications()
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleSheetOpenChange = (open: boolean) => {
    setOpen(open)
  }

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetTrigger asChild>
        <Button variant="secondary" size="icon" className="fixed md:top-4 bottom-20 right-4 z-50 rounded-full bg-background shadow-md">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notificações</SheetTitle>
        </SheetHeader>
        <NotificationsList notifications={notifications} markAsRead={markAsRead} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

