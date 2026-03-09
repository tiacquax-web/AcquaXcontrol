'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * ResidentGuard — blocks users whose ONLY role is "Morador" (resident)
 * from accessing the AcquaX Field app.
 * If the user has any other role (Administrador, Leiturista, etc.) they pass through.
 */
export function ResidentGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [allowed, setAllowed] = useState<boolean | null>(null)

    useEffect(() => {
        fetch('/api/auth/my-context')
            .then(r => r.ok ? r.json() : null)
            .then(ctx => {
                if (!ctx) {
                    setAllowed(true) // if context fails, don't block
                    return
                }
                const roles: string[] = ctx.systemRoles || []
                const isOnlyResident = (
                    roles.length > 0 &&
                    roles.every((r: string) => r.toLowerCase().includes('morador') || r.toLowerCase().includes('resident'))
                )
                if (isOnlyResident) {
                    // Redirect residents to a friendly "access denied" page
                    router.replace('/login?error=resident_not_allowed')
                } else {
                    setAllowed(true)
                }
            })
            .catch(() => setAllowed(true)) // on error, allow through
    }, [router])

    if (allowed === null) {
        // Loading state — brief flash, avoid layout shift
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
        )
    }

    return <>{children}</>
}
