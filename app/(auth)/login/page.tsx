"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, LogIn } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"
import { useLogin } from "@/hooks/useAuth"

// Esquema de validação com zod
// Aceita emails padrão E emails com domínios simples (ex: usuario@dominio sem .com)
const emailRegex = /^[^\s@]+@[^\s@]+$/;
const formSchema = z.object({
  email: z.string().regex(emailRegex, { message: "Email inválido" }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" }),
})

type FormValues = z.infer<typeof formSchema>

export default function Login() {
  const { login, loading: isLoading, error } = useLogin()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      const data = await login(values)
      // Usa window.location para forçar reload completo
      // Isso garante que o middleware leia o cookie recém-criado
      if (data.user?.mustUpdateCredentials) {
        window.location.href = "/first-access"
        return
      }
      window.location.href = "/dashboard"
    } catch {
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
              className="mb-1"
              priority
            />
          </div>
          <div className="text-center">
            <span className="text-sm font-semibold tracking-widest text-sky-500 uppercase">Field</span>
          </div>
          <CardDescription className="text-center">Entre com seu email e senha para acessar sua conta</CardDescription>
        </CardHeader>
        <CardContent>
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
                      <Input placeholder="seu@email.com" type="email" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input placeholder="Sua senha" type="password" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        {/* <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-muted-foreground text-center">
            <a href="/forgot-password" className="hover:text-primary underline underline-offset-4">
              Esqueceu sua senha?
            </a>
          </div>
          <div className="text-sm text-muted-foreground text-center">
            Não tem uma conta?{" "}
            <a href="/register" className="hover:text-primary underline underline-offset-4">
              Registre-se
            </a>
          </div>
        </CardFooter> */}
      </Card>
    </div>
  )
}

