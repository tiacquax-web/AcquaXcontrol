'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    const enableDevSw = process.env.NEXT_PUBLIC_ENABLE_SW_DEV === 'true'
    const shouldRegister = (process.env.NODE_ENV === 'production' || enableDevSw) && 'serviceWorker' in navigator
    if (shouldRegister) {
      let reloadedForUpdate = false;
      const handleControllerChange = () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker
        .register(`/sw.js?v=v5-2026-08-19-dates`, { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(console.error);

      return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    }
  }, [])
  return null
}
