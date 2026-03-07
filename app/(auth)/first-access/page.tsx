"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentUser, useUpdateCurrentUser } from "@/hooks/useCurrentUser";

export default function FirstAccess() {
  const router = useRouter();
  const { user, loading, error } = useCurrentUser();
  const { updateUser, loading: saving, error: saveError } = useUpdateCurrentUser();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (user && typeof user === "object") {
      setForm((prev) => ({
        ...prev,
        name: (user as any).name || "",
        email: (user as any).email || "",
      }));
      if (!(user as any).mustUpdateCredentials) {
        router.push("/dashboard");
      }
    }
  }, [user, router]);

  useEffect(() => {
    // Não exibe erros do GET /me como bloqueantes — o usuário já está autenticado
    // pelo middleware (JWT válido), só pode não ter sessão no banco
    if (error && error !== 'Request failed with status code 401') {
      setFormError(error);
    }
  }, [error]);

  useEffect(() => {
    if (saveError) setFormError(saveError);
  }, [saveError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.password) {
      setFormError("A nova senha é obrigatória.");
      return;
    }

    if (form.password.length < 6) {
      setFormError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setFormError("As senhas não coincidem.");
      return;
    }

    // Build update payload - password is mandatory, email and name are optional (keep existing if empty)
    const payload: Record<string, string> = { password: form.password };
    if (form.email && form.email.trim()) payload.email = form.email.trim();
    if (form.name && form.name.trim()) payload.name = form.name.trim();

    try {
      const updated = await updateUser(payload);
      if (updated) {
        router.push("/dashboard");
      }
    } catch {
      // handled by saveError
    }
  };

  // Mostra carregando apenas brevemente; se falhar (sem sessão no banco), exibe o form mesmo assim
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
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
          <CardTitle className="text-center text-lg">Primeiro acesso</CardTitle>
          <CardDescription className="text-center">
            Defina sua senha para continuar. Nome e e-mail são opcionais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">
                Nome <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <Input
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder="Seu nome completo"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">
                Email <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <Input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="seu@email.com"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">
                Nova senha <span className="text-red-500">*</span>
              </label>
              <Input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                disabled={saving}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">
                Confirmar nova senha <span className="text-red-500">*</span>
              </label>
              <Input
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                disabled={saving}
                placeholder="Repita a senha"
              />
            </div>
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar e continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
