'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    const enableDevSw = process.env.NEXT_PUBLIC_ENABLE_SW_DEV === 'true'
    const shouldRegister = (process.env.NODE_ENV === 'production' || enableDevSw) && 'serviceWorker' in navigator
    if (shouldRegister) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [])
  return null
}
