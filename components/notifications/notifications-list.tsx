"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Check, FileWarning, Info, Lightbulb, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import type { Notification } from "@/types/notification"

interface NotificationsListProps {
  notifications: Notification[]
  markAsRead: (id: string) => void
  onClose: () => void
}

export function NotificationsList({ notifications, markAsRead, onClose }: NotificationsListProps) {
  const router = useRouter()

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    if (notification.actionUrl) {
      router.push(notification.actionUrl)
      onClose()
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "info":
        return <Info className="h-5 w-5 text-blue-500" />
      case "warning":
        return <FileWarning className="h-5 w-5 text-amber-500" />
      case "success":
        return <Check className="h-5 w-5 text-green-500" />
      case "reading":
        return <Camera className="h-5 w-5 text-purple-500" />
      case "tip":
        return <Lightbulb className="h-5 w-5 text-yellow-500" />
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <Bell className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Você não tem notificações</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[80vh] mt-4 pr-4">
      <div className="space-y-4">
        {notifications.map((notification) => (
          <Card
            key={notification.id}
            className={cn(
              "cursor-pointer transition-colors hover:bg-muted/50",
              !notification.read && "border-l-4 border-l-primary",
            )}
            onClick={() => handleNotificationClick(notification)}
          >
            <CardHeader className="flex flex-row items-start space-y-0 pb-2">
              <div className="flex items-start gap-2">
                {getNotificationIcon(notification.type)}
                <div>
                  <CardTitle className={cn("text-base", !notification.read && "font-bold")}>
                    {notification.title}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {format(new Date(notification.date), "dd/MM/yyyy HH:mm")}
                  </CardDescription>
                </div>
              </div>
              {!notification.read && (
                <div className="ml-auto">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm">{notification.message}</p>
            </CardContent>
            {notification.actionLabel && (
              <CardFooter>
                <Button variant="ghost" size="sm" className="ml-auto">
                  {notification.actionLabel}
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  )
}

// Import for the empty state
const Bell = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

