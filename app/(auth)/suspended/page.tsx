"use client"

import { AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SuspendedPage() {
    const router = useRouter()

    useEffect(() => {
        // Limpa a sessão ao carregar a página de suspensão
        document.cookie = "session=; path=/; maxAge=0; httpOnly; secure; samesite=lax"
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <Card className="max-w-md w-full">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-2">
                        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-amber-600" />
                        </div>
                    </div>
                    <CardTitle className="text-xl text-gray-900">
                        Acesso Suspenso
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                    <p className="text-gray-600 text-sm">
                        Seu acesso ao sistema foi suspenso temporariamente.
                    </p>
                    <p className="text-gray-600 text-sm font-medium">
                        Procure a administração do seu condomínio para mais informações.
                    </p>
                    <div className="pt-4">
                        <Button
                            variant="outline"
                            onClick={() => router.push("/login")}
                            className="w-full"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar para o login
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
