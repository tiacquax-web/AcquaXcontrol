export interface Notification {
    id: string
    title: string
    message: string
    type: "info" | "warning" | "success" | "reading" | "tip"
    date: string
    read: boolean
    actionUrl?: string
    actionLabel?: string
  }
  
  