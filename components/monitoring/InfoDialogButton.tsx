"use client"

import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface InfoDialogButtonProps {
  title: string
  description?: string
  children?: ReactNode
  triggerLabel?: string
  className?: string
  triggerClassName?: string
  size?: "icon" | "sm" | "default"
}

export function InfoDialogButton({
  title,
  description,
  children,
  triggerLabel,
  className,
  triggerClassName,
  size = "icon",
}: InfoDialogButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={size === "icon" ? "icon" : "sm"}
          className={cn(
            "h-6 w-6 p-0 text-muted-foreground hover:text-foreground",
            size !== "icon" && "px-2 h-7 text-xs",
            triggerClassName
          )}
          aria-label={triggerLabel ?? `Mais informações sobre ${title}`}
        >
          {triggerLabel ? (
            <span>{triggerLabel}</span>
          ) : (
            <Info className="h-4 w-4" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("max-w-md space-y-3", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>}
      </DialogContent>
    </Dialog>
  )
}
