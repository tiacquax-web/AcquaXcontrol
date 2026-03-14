# Backup runbook (AcquaXControl)

Este runbook cria backup local do repositório com segurança para permitir atualizações sem risco.

## O que é gerado

Ao executar `scripts/create_backup.sh`, é criada uma pasta em `backups/acquaxcontrol-YYYYMMDD-HHMMSS` com:

- `repository-full.bundle`: histórico completo Git (`--all`)
- `repository-head.tar.gz`: snapshot do código atual (HEAD)
- `metadata.env`: branch, commit e remote usados no backup
- `git-status.txt`: estado do worktree no momento do backup
- `recent-commits.txt`: últimos 30 commits
- `SHA256SUMS.txt`: checksums dos artefatos
- `database-dump.tar.gz` (opcional): backup do banco, apenas se `mongodump` e `DATABASE_URL` estiverem disponíveis

## Como executar

```bash
bash scripts/create_backup.sh
```

## Como restaurar o código

### Opção A — restaurar histórico completo

```bash
git clone /caminho/vazio repo-restaurado
cd repo-restaurado
git pull "/caminho/backup/repository-full.bundle" --all
git checkout <branch-desejada>
```

### Opção B — restaurar apenas snapshot

```bash
mkdir repo-snapshot
tar -xzf /caminho/backup/repository-head.tar.gz -C repo-snapshot
```

## Validação de integridade

```bash
cd /caminho/backup
sha256sum -c SHA256SUMS.txt
```

## Recomendação operacional

- Gerar backup **antes** de qualquer atualização crítica.
- Copiar a pasta `backups/acquaxcontrol-...` para armazenamento externo seguro (S3, Drive corporativo ou NAS).
