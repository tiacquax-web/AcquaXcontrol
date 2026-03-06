"use client"

import { useState, useEffect } from "react"
import type { Notification } from "@/types/notification"

// Mock notifications data
const mockNotifications: Notification[] = [
  {
    id: "1",
    title: "Leitura pendente",
    message: "Você tem uma leitura pendente para o medidor A24HR0006239 do apartamento 102, bloco A, condomínio 1.",
    type: "reading",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    read: false,
    actionUrl: "/readings/e6c52314-0a80-4def-89b2-3fb9c793d5b9/1438/manual-record",
    actionLabel: "Registrar leitura",
  },
  {
    id: "2",
    title: "Consumo acima da média",
    message: "O consumo de água do seu apartamento está 20% acima da média dos últimos 3 meses.",
    type: "warning",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    read: false,
    actionUrl: "/readings/e6c52314-0a80-4def-89b2-3fb9c793d5b9/1438",
    actionLabel: "Ver detalhes",
  },
  {
    id: "3",
    title: "Manutenção programada",
    message: "Haverá manutenção no sistema de água do condomínio no dia 15/05/2025 das 8h às 12h.",
    type: "info",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
    read: true,
  },
  {
    id: "4",
    title: "Economia de água",
    message: "Dica: Fechar a torneira enquanto escova os dentes pode economizar até 12 litros de água por dia.",
    type: "tip",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days ago
    read: true,
  },
  {
    id: "5",
    title: "Fatura disponível",
    message: "Sua fatura de água do mês de abril está disponível para visualização.",
    type: "info",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 7 days ago
    read: true,
    actionUrl: "#",
    actionLabel: "Ver fatura",
  },
  {
    id: "6",
    title: "Pagamento confirmado",
    message: "O pagamento da sua fatura de água do mês de março foi confirmado.",
    type: "success",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
    read: true,
  },
]

export function useNotifications() {
  // In a real app, this would fetch from an API
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    // Simulate API fetch
    const fetchNotifications = async () => {
      // In a real app, this would be an API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Get notifications from localStorage or use mock data
      const storedNotifications = localStorage.getItem("notifications")
      if (storedNotifications) {
        setNotifications(JSON.parse(storedNotifications))
      } else {
        setNotifications(mockNotifications)
      }
    }

    fetchNotifications()
  }, [])

  // Save notifications to localStorage when they change
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem("notifications", JSON.stringify(notifications))
    }
  }, [notifications])

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
    )
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
  }

  const clearNotifications = () => {
    setNotifications([])
    localStorage.removeItem("notifications")
  }

  return {
    notifications,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  }
}

