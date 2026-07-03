'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useComplexes } from '@/hooks/useComplexes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Link2, SkipForward, Loader2, Mail, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PreviewRow {
  row: number;
  blockName: string;
  apartmentName: string;
  residentName: string;
  email: string;
  apartmentFound: boolean;
  blockFound: string | null;
  currentEmail: string | null;
  action: string;
  actionLabel: string;
}

interface PreviewSummary {
  total: number;
  create: number;
  update: number;
  link_only: number;
  skip: number;
  errors: number;
}

interface ProcessResult {
  summary: {
    total: number;
    created: number;
    updated: number;
    linked: number;
    skipped: number;
    errors: number;
    emailsSent: number;
    emailsSkipped: number;
  };
  results: any[];
}

export default function BulkImportTab() {
  const { complexes, loading: loadingComplexes } = useComplexes({ take: 100 });
  const { toast } = useToast();
  const [selectedComplex, setSelectedComplex] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [parsing, setParsing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0] || null);
    setPreview([]);
    setPreviewSummary(null);
    setProcessResult(null);
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleParse = async () => {
    if (!file || !selectedComplex) return;
    setParsing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('complexId', selectedComplex);

      const res = await fetch('/api/user/bulk-import/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar planilha');

      setPreview(data.preview);
      setPreviewSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleProcess = async () => {
    if (!file || !selectedComplex) return;
    setProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('complexId', selectedComplex);

      const res = await fetch('/api/user/bulk-import/process', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar importação');

      setProcessResult(data);
      toast({
        title: 'Importação concluída!',
        description: `${data.summary.created} criados, ${data.summary.updated} atualizados, ${data.summary.emailsSent} emails enviados.`,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setPreviewSummary(null);
    setProcessResult(null);
    setError(null);
  };

  const actionIcon = (action: string) => {
    switch (action) {
      case 'create': return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      case 'update': return <RefreshCw className="h-4 w-4 text-amber-500" />;
      case 'link_only': return <Link2 className="h-4 w-4 text-green-500" />;
      case 'skip_already_linked': return <SkipForward className="h-4 w-4 text-gray-400" />;
      case 'error_not_found': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Passo 1: Selecionar condomínio e subir planilha */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Selecione o condomínio e a planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Condomínio</label>
            <Select value={selectedComplex} onValueChange={(v) => { setSelectedComplex(v); reset(); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loadingComplexes ? 'Carregando...' : 'Selecione o condomínio'} />
              </SelectTrigger>
              <SelectContent>
                {complexes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.socialName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(0)} KB</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-gray-400" />
                <p className="text-sm text-muted-foreground">
                  Arraste uma planilha aqui ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">Formatos: .xlsx, .xls</p>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
            <p className="font-medium mb-1">Formato esperado da planilha:</p>
            <p>Colunas: <strong>Bloco</strong> | <strong>Apartamento</strong> | <strong>Nome do Morador</strong> (opcional) | <strong>E-mail</strong></p>
            <p className="mt-1">O sistema detecta automaticamente as colunas pelo cabeçalho.</p>
            <p className="mt-1 text-amber-600">⚠️ Se a unidade já tiver um usuário (ex: email provisório @acquax), ele será <strong>atualizado</strong> com o novo email e receberá uma nova senha provisória.</p>
          </div>

          <Button onClick={handleParse} disabled={!file || !selectedComplex || parsing} className="w-full">
            {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando planilha...</> : 'Analisar planilha'}
          </Button>
        </CardContent>
      </Card>

      {/* Passo 2: Preview */}
      {previewSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Revisar dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{previewSummary.create}</p>
                <p className="text-xs text-muted-foreground">Criar</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-amber-500">{previewSummary.update}</p>
                <p className="text-xs text-muted-foreground">Atualizar</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-green-600">{previewSummary.link_only}</p>
                <p className="text-xs text-muted-foreground">Vincular</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-gray-400">{previewSummary.skip}</p>
                <p className="text-xs text-muted-foreground">Pular</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-red-500">{previewSummary.errors}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Apto</TableHead>
                    <TableHead>Morador</TableHead>
                    <TableHead>E-mail (novo)</TableHead>
                    <TableHead>Email atual</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{row.row}</TableCell>
                      <TableCell className="font-medium">{row.apartmentName}</TableCell>
                      <TableCell className="text-sm">{row.residentName || '—'}</TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.currentEmail || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {actionIcon(row.action)}
                          <span className="text-xs">{row.actionLabel}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button
              onClick={handleProcess}
              disabled={processing || (previewSummary.create + previewSummary.update + previewSummary.link_only === 0)}
              className="w-full"
              size="lg"
            >
              {processing
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                : `Confirmar e processar (${previewSummary.create + previewSummary.update + previewSummary.link_only} unidades)`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Passo 3: Resultado */}
      {processResult && (
        <Card className="border-green-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Importação concluída!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{processResult.summary.created}</p>
                <p className="text-xs text-muted-foreground">Criados</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-amber-500">{processResult.summary.updated}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-green-600">{processResult.summary.linked}</p>
                <p className="text-xs text-muted-foreground">Vinculados</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-red-500">{processResult.summary.errors}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> {processResult.summary.emailsSent} emails enviados</span>
              {processResult.summary.emailsSkipped > 0 && (
                <span>{processResult.summary.emailsSkipped} não enviados</span>
              )}
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Apto</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processResult.results.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="font-medium">{r.aptName}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <Badge variant={
                          r.status === 'created' ? 'default' :
                          r.status === 'updated' ? 'secondary' :
                          r.status === 'linked' ? 'secondary' :
                          r.status === 'error' ? 'destructive' : 'outline'
                        }>
                          {r.status === 'created' ? 'Criado' :
                           r.status === 'updated' ? 'Atualizado' :
                           r.status === 'linked' ? 'Vinculado' :
                           r.status === 'error' ? 'Erro' : 'Pulado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button variant="outline" onClick={reset} className="w-full">Nova importação</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
