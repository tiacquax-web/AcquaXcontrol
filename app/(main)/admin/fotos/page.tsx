'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Upload, ImageIcon, ExternalLink, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Unit {
  id: string;
  name: string;
  registers: string[];
  readingId: string | null;
  reading: number | null;
  urlCover: string | null;
}
interface Block { id: string; name: string; apartments: Unit[] }
interface UploadResult {
  file: string;
  ok: boolean;
  url?: string;
  block?: string;
  unit?: string;
  register?: string;
  updated?: boolean;
  warnings?: string[];
  error?: string;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function AdminPhotosPage() {
  const { toast } = useToast();

  const [complexes, setComplexes] = useState<{ id: string; name: string }[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const now = new Date();
  const [complexId, setComplexId] = useState('');
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [search, setSearch] = useState('');

  const batchInputRef = useRef<HTMLInputElement>(null);

  const loadComplexes = useCallback(async () => {
    const res = await fetch('/api/admin/photos?list=complexes');
    if (res.status === 403) { setAccessDenied(true); return; }
    const json = await res.json();
    setComplexes(json.complexes || []);
    setStorageConfigured(Boolean(json.storageConfigured));
  }, []);

  const loadUnits = useCallback(async () => {
    if (!complexId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/photos?complexId=${complexId}&month=${month}&year=${year}`);
      if (res.status === 403) { setAccessDenied(true); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar unidades.');
      setBlocks(json.blocks || []);
      setStorageConfigured(Boolean(json.storageConfigured));
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [complexId, month, year, toast]);

  useEffect(() => { loadComplexes(); }, [loadComplexes]);
  useEffect(() => { loadUnits(); }, [loadUnits]);

  const uploadFiles = async (files: FileList | File[], apartmentId?: string) => {
    const form = new FormData();
    form.append('complexId', complexId);
    form.append('month', month);
    form.append('year', year);
    if (apartmentId) form.append('apartmentId', apartmentId);
    Array.from(files).forEach((f) => form.append('files', f));

    const res = await fetch('/api/admin/photos', { method: 'POST', body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro no envio.');
    return json.results as UploadResult[];
  };

  const handleSingle = async (unit: Unit, file: File) => {
    setUploadingKey(unit.id);
    try {
      const r = await uploadFiles([file], unit.id);
      setResults((prev) => [...r, ...prev].slice(0, 40));
      const first = r[0];
      if (!first?.ok) throw new Error(first?.error || 'Falha no envio.');
      toast({ title: `Foto enviada - ${unit.name}`, description: first.updated ? 'Link atualizado na leitura.' : (first.warnings?.[0] || first.url) });
      await loadUnits();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleBatch = async () => {
    const files = batchInputRef.current?.files;
    if (!files || !files.length) return;
    setBatchUploading(true);
    try {
      const r = await uploadFiles(files);
      setResults((prev) => [...r, ...prev].slice(0, 40));
      const ok = r.filter((x) => x.ok).length;
      toast({ title: `Lote: ${ok}/${r.length} enviadas`, description: ok === r.length ? 'Todas as fotos foram atualizadas.' : 'Veja os detalhes abaixo.' });
      if (batchInputRef.current) batchInputRef.current.value = '';
      await loadUnits();
    } catch (e: any) {
      toast({ title: 'Erro no lote', description: e.message, variant: 'destructive' });
    } finally {
      setBatchUploading(false);
    }
  };

  const visibleBlocks = useMemo(() => {
    if (!search.trim()) return blocks;
    const q = search.trim().toLowerCase();
    return blocks
      .map((b) => ({
        ...b,
        apartments: b.apartments.filter(
          (a) => a.name.toLowerCase().includes(q) || a.registers.some((r) => r.toLowerCase().includes(q)),
        ),
      }))
      .filter((b) => b.apartments.length > 0);
  }, [blocks, search]);

  const totalUnits = blocks.reduce((acc, b) => acc + b.apartments.length, 0);
  const withPhoto = blocks.reduce((acc, b) => acc + b.apartments.filter((a) => a.urlCover).length, 0);

  if (accessDenied) {
    return (
      <div className="p-6 max-w-3xl">
        <Card>
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta ferramenta está disponível somente para o acesso administrativo.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Fotos de medidor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sobe a foto para o CDN e atualiza o link da leitura da unidade no mês escolhido. Em lote, o nome do arquivo
          precisa ser o número da unidade ou a referência do medidor (ex.: 507.jpg ou RSDCA507.jpg).
        </p>
      </div>

      {!storageConfigured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Armazenamento do CDN ainda não configurado (B2_KEY_ID, B2_APP_KEY, B2_BUCKET). O envio fica bloqueado até lá.
        </div>
      )}

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2 space-y-1">
            <Label>Condomínio</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={complexId}
              onChange={(e) => setComplexId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {complexes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Mês</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, '0')}>{String(i + 1).padStart(2, '0')} - {m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Ano</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {complexId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Envio em lote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                ref={batchInputRef as any}
                type="file"
                accept="image/*"
                multiple
                className="max-w-md"
                disabled={!storageConfigured || batchUploading}
              />
              <Button onClick={handleBatch} disabled={!storageConfigured || batchUploading}>
                {batchUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Enviar em lote
              </Button>
              <span className="text-xs text-muted-foreground">
                {totalUnits} unidades no mês · {withPhoto} com foto
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Últimos envios</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-auto">
            {results.map((r, i) => (
              <div key={`${r.file}-${i}`} className="flex items-start gap-2 text-sm border-b last:border-0 pb-2">
                {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-600 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {r.file}
                    {r.unit ? ` → ${r.block}/${r.unit}` : ''}
                    {r.register ? ` (${r.register})` : ''}
                  </div>
                  {r.error && <div className="text-red-600">{r.error}</div>}
                  {r.warnings?.map((w) => <div key={w} className="text-amber-700">{w}</div>)}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                      {r.url} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {complexId && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Unidades</CardTitle>
            <Input
              placeholder="Filtrar por unidade ou referência..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs h-9"
            />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : visibleBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma unidade encontrada.</p>
            ) : (
              <div className="space-y-6">
                {visibleBlocks.map((block) => (
                  <div key={block.id} className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Bloco {block.name}</p>
                    <div className="divide-y rounded-md border">
                      {block.apartments.map((unit) => (
                        <div key={unit.id} className="flex items-center gap-3 p-2">
                          <div className="w-12 h-12 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {unit.urlCover ? (
                              <img src={unit.urlCover} alt={`Foto ${unit.name}`} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">Unidade {unit.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {unit.registers.length ? `Ref. ${unit.registers.join(', ')}` : 'Sem medidor'}
                              {unit.reading != null ? ` · leitura ${unit.reading}` : ''}
                              {!unit.readingId ? ' · sem leitura no mês' : ''}
                            </div>
                            {unit.urlCover && (
                              <a href={unit.urlCover} target="_blank" rel="noreferrer" className="text-xs text-primary truncate inline-flex items-center gap-1">
                                ver foto atual <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <div>
                            <input
                              id={`file-${unit.id}`}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={!storageConfigured || uploadingKey === unit.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.currentTarget.value = '';
                                if (file) handleSingle(unit, file);
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!storageConfigured || uploadingKey === unit.id}
                              onClick={() => document.getElementById(`file-${unit.id}`)?.click()}
                            >
                              {uploadingKey === unit.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
