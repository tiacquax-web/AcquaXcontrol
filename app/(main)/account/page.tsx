'use client'
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useCurrentUser, useUpdateCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

export default function Account() {
    const { user, loading, error } = useCurrentUser();
    const { updateUser, loading: saving, error: saveError } = useUpdateCurrentUser();
    const { toast } = useToast();
    const [form, setForm] = useState<{ name: string; email: string; password: string; confirmPassword: string }>({ name: "", email: "", password: "", confirmPassword: "" });

    useEffect(() => {
        if (user && typeof user === "object") {
            setForm(f => ({ ...f, name: (user as any).name || "", email: (user as any).email || "" }));
        }
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name || !form.email) return;
        if (form.password && form.password !== form.confirmPassword) {
            toast({
                title: "As senhas não coincidem",
                description: "Verifique a confirmação da nova senha.",
                variant: "destructive",
            });
            return;
        }
        const updateData: any = { name: form.name, email: form.email };
        if (form.password) updateData.password = form.password;
        try {
            const updated = await updateUser(updateData);
            if (updated) {
                toast({
                    title: "Dados atualizados com sucesso!",
                    description: "Suas informações foram salvas.",
                    variant: "default",
                });
                setForm(f => ({ ...f, password: "", confirmPassword: "" }));
            } else {
                toast({
                    title: "Erro ao salvar",
                    description: saveError || "Não foi possível atualizar os dados. Tente novamente.",
                    variant: "destructive",
                });
            }
        } catch (err: any) {
            toast({
                title: "Erro ao salvar",
                description: err?.response?.data?.error || err?.message || "Erro inesperado ao salvar os dados.",
                variant: "destructive",
            });
        }
    };

    if (loading) return <div className="p-6">Carregando...</div>;
    if (error) return <div className="p-6 text-red-500">Erro: {error}</div>;

    return (
        <>
            <h1 className="text-2xl font-bold mb-1 mx-5">Conta</h1>
            <p className="mb-4 mx-5">Configure sua conta</p>
            <Separator className="mb-6" />
            <div className="max-w-xs md:max-w-md mx-auto md:mx-5">
                <form onSubmit={handleSubmit}>
                    <section className="mb-8">
                        <h2 className="text-lg font-bold mb-2">Informações</h2>
                        <div className="mb-4">
                            <label className="block mb-1">Nome</label>
                            <Input name="name" value={form.name} onChange={handleChange} required />
                        </div>
                        <div className="mb-4">
                            <label className="block mb-1">Email</label>
                            <Input name="email" type="email" value={form.email} onChange={handleChange} required />
                        </div>
                        <Separator className="mb-6" />
                    </section>
                    <section>
                        <h2 className="text-lg font-bold mb-2">Segurança</h2>
                        <div className="mb-4">
                            <label className="block mb-1">Nova senha</label>
                            <Input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Deixe em branco para não alterar" />
                        </div>
                        <div className="mb-4">
                            <label className="block mb-1">Confirmar nova senha</label>
                            <Input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="Confirme a nova senha" />
                        </div>
                    </section>
                    <section>
                        <Button className="mt-8 mb-4 w-full" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
                    </section>
                </form>
            </div>
        </>
    );
}