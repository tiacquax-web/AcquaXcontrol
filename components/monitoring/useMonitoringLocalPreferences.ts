import { useEffect, useState } from 'react'

interface MonitoringPrefs {
  meterIds: string[]
  view: 'cumulative' | 'simple'
  mode: 'raw' | 'dailyLast'
  alertsOnly: boolean
  sigma: number
  alertTypes: string[]
}

const KEY = 'acquax.monitoring.prefs'

const DEFAULT_PREFS: MonitoringPrefs = {
  meterIds: [],
  view: 'cumulative',
  mode: 'dailyLast',
  alertsOnly: false,
  sigma: 2,
  alertTypes: []
}

export function useMonitoringLocalPreferences() {
  const [prefs, setPrefs] = useState<MonitoringPrefs>(DEFAULT_PREFS)
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setPrefs({ ...DEFAULT_PREFS, ...parsed })
      }
    } catch {}
    setReady(true)
  }, [])

  function update(partial: Partial<MonitoringPrefs>) {
    setPrefs(prev => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { prefs, update, ready }
}
