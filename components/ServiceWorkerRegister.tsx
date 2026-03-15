'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Hotfix de estabilidade:
    // remove SW legado para evitar cache de chunks antigos e "client-side exception".
    if (!('serviceWorker' in navigator)) return
    ;(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((reg) => reg.unregister()))
      } catch (e) {
        console.warn('[SW] unregister failed:', e)
      }
      if ('caches' in window) {
        try {
          const names = await caches.keys()
          await Promise.all(names.map((name) => caches.delete(name)))
        } catch (e) {
          console.warn('[SW] cache cleanup failed:', e)
        }
      }
    })()
  }, [])
  return null
}
