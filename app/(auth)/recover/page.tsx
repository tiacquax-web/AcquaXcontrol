"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, Mail, ArrowLeft, CheckCircle2, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"

const emailRegex = /^[^\s@]+@[^\s@]+$/
const formSchema = z.object({
  email: z.string().regex(emailRegex, { message: "Email inválido" }),
})

type FormValues = z.infer<typeof formSchema>

export default function RecoverPassword() {
  const router = useRouter()
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || data.message || "Erro ao enviar email")
      }
      setSent(true)
    } catch (err: any) {
      setError(err.message || "Erro ao processar solicitação")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex justify-center">
            <Image
              src="/logo-acquax.png"
              alt="Acqua X do Brasil"
              width={250}
              height={50}
              className="mb-2"
              priority
            />
          </div>
          <CardDescription className="text-center">
            {sent
              ? "Solicitação enviada"
              : "Informe seu email e enviaremos um link para redefinir sua senha"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Caso seu email esteja cadastrado, você receberá um email com as instruções para redefinir sua senha.
                  O link expira em 1 hora.
                </p>
                <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                  <span>
                    Não recebeu o email? Verifique a pasta de spam ou lixo eletrônico.
                    Caso o problema persista, procure a administração do seu condomínio
                    para confirmar se seu email está cadastrado no sistema.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="seu@email.com"
                            type="email"
                            {...field}
                            disabled={loading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Enviar link de recuperação
                      </>
                    )}
                  </Button>
                </form>
              </Form>
              <div className="text-sm text-muted-foreground text-center mt-4">
                <button
                  onClick={() => router.push("/login")}
                  className="hover:text-primary underline underline-offset-4"
                >
                  Voltar para o login
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
