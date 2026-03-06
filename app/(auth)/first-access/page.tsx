"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentUser, useUpdateCurrentUser } from "@/hooks/useCurrentUser";

export default function FirstAccess() {
  const router = useRouter();
  const { user, loading, error } = useCurrentUser();
  const { updateUser, loading: saving, error: saveError } = useUpdateCurrentUser();
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (user && typeof user === "object") {
      const currentEmail = (user as any).email || "";
      setForm((prev) => ({ ...prev, email: currentEmail }));
      if (!(user as any).mustUpdateCredentials) {
        router.push("/dashboard");
      }
    }
  }, [user, router]);

  useEffect(() => {
    if (error) {
      setFormError(error);
    }
  }, [error]);

  useEffect(() => {
    if (saveError) {
      setFormError(saveError);
    }
  }, [saveError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.email || !form.password || !form.confirmPassword) {
      setFormError("Preencha email e senha para continuar.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setFormError("As senhas nao coincidem.");
      return;
    }

    try {
      const updated = await updateUser({ email: form.email, password: form.password });
      if (updated) {
        router.push("/dashboard");
      }
    } catch {
      // handled by saveError
    }
  };

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
          <CardDescription className="text-center">
            Voce precisa atualizar seu email e senha para continuar
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
              <label className="block mb-1">Email</label>
              <Input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="block mb-1">Nova senha</label>
              <Input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="block mb-1">Confirmar nova senha</label>
              <Input
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                disabled={saving}
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
