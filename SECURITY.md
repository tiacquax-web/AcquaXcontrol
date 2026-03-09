# 🛡️ ACQUAXCONTROL — GUIA DE SEGURANÇA

## Status das proteções implementadas

### ✅ Middleware (Edge — executa em TODA requisição)

| Proteção | Descrição |
|----------|-----------|
| **Rate Limiting — Login** | Máx. 10 tentativas/minuto por IP (anti brute-force) |
| **Rate Limiting — API** | Máx. 200 req/minuto por IP |
| **Rate Limiting — Páginas** | Máx. 100 req/minuto por IP |
| **Bloqueio de User-Agent malicioso** | Bloqueia sqlmap, nikto, nmap, scrapy, metasploit, burpsuite, etc. |
| **Honeypot paths** | Retorna 404 para `/wp-admin`, `/.env`, `/.git`, `/phpmyadmin`, `/shell`, etc. |
| **Detecção de injeção** | Bloqueia SQL Injection, XSS, Path Traversal, Command Injection, LDAP injection, Null bytes na URL |
| **JWT httpOnly + Secure + SameSite=Strict** | Cookie de sessão blindado contra XSS e CSRF |
| **HSTS** | Força HTTPS por 1 ano + subdomínios + preload |
| **X-Frame-Options: DENY** | Impede clickjacking/iframes |
| **X-Content-Type-Options: nosniff** | Impede MIME sniffing |
| **X-XSS-Protection** | Proteção XSS em browsers legados |
| **Referrer-Policy** | Não vaza URL completa em referrer |
| **Permissions-Policy** | Desabilita câmera, microfone, geolocalização, pagamento |
| **CSP (Content Security Policy)** | Restringe origens de scripts, estilos, imagens, frames |
| **CORS restrito** | Em produção, só aceita requisições de `acquaxcontrol.com.br` |

---

## 🔐 JWT e Sessão

O sistema usa **JWT** armazenado em **cookie httpOnly**:
- `httpOnly: true` → JavaScript no browser NÃO consegue ler o cookie (protege contra XSS)
- `secure: true` → Cookie só enviado via HTTPS (produção)
- `sameSite: strict` → Cookie NÃO é enviado em requisições cross-site (protege contra CSRF)

### ⚠️ O JWT_SECRET atual está fraco. Gere um forte com:

```bash
# Linux/Mac:
openssl rand -base64 64

# Node.js:
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Cole o resultado como variável `JWT_SECRET` no Vercel.

---

## 🗄️ MongoDB Atlas — Segurança

### Configurações recomendadas:
1. **Senhas fortes** no usuário do banco (mínimo 20 chars, aleatória)
2. **IP Allowlist:** Idealmente restringir aos IPs do Vercel. Porém, como o Vercel usa IPs dinâmicos, usar `0.0.0.0/0` com autenticação forte é aceitável.
3. **Ativar MongoDB Atlas Auditing** (planos pagos) para log de todas as operações
4. **Backup automático** ativado no Atlas
5. **Rotate password** a cada 6 meses

### Se suspeitar de vazamento de credenciais:
```
1. Acesse cloud.mongodb.com → Database Access
2. Edite o usuário → Generate New Password
3. Atualize a variável DATABASE_URL no Vercel imediatamente
4. Faça redeploy no Vercel
```

---

## 🔑 Vercel — Segurança

### Proteções já ativas:
- HTTPS automático via Let's Encrypt (certificados renovados automaticamente)
- Edge Network com DDoS protection básica (inclusa no plano Hobby e Pro)
- Deploy isolado por branch (preview vs production)

### Recomendações adicionais:
1. **Ativar 2FA na conta Vercel** → vercel.com/account/security
2. **Ativar 2FA na conta GitHub** → github.com/settings/security
3. **Restringir quem pode fazer deploy** → Vercel → Team Settings → Members
4. **Nunca commitar o .env no GitHub** (já está no .gitignore ✅)

---

## 🐙 GitHub — Segurança

### Proteções do repositório:
1. **Ativar branch protection** em `principal`:
   - Vá em Settings → Branches → Add rule
   - Branch name: `principal`
   - ✅ Require pull request before merging
   - ✅ Require status checks
   - ✅ Restrict force pushes
2. **Ativar GitHub Secret Scanning** → Settings → Security → Secret scanning
3. **Ativar Dependabot** → Settings → Security → Dependabot alerts
4. **NÃO commitar arquivos .env, chaves privadas, senhas**

---

## 🛡️ Proteções contra ataques específicos

### Brute Force / Credential Stuffing
- ✅ Rate limiting de 10 tentativas/min no endpoint de login
- ✅ Passwords hasheadas com bcrypt (custo 12)
- ✅ JWT com expiração (não permanente)

### SQL/NoSQL Injection
- ✅ Prisma ORM com queries parametrizadas (não usa concatenação de strings)
- ✅ Validação de padrões de injeção no middleware
- ✅ MongoDB por padrão não executa JavaScript em queries (jsMode desabilitado)

### XSS (Cross-Site Scripting)
- ✅ Cookie httpOnly (JS não acessa o token)
- ✅ CSP headers restringem execução de scripts externos
- ✅ React escapa HTML automaticamente

### CSRF (Cross-Site Request Forgery)
- ✅ `sameSite: strict` no cookie de sessão
- ✅ CORS restrito ao domínio de produção

### Clickjacking
- ✅ `X-Frame-Options: DENY`
- ✅ CSP `frame-src 'none'`

### DDoS / Flood
- ✅ Rate limiting por IP no middleware
- ✅ Vercel Edge Network absorve tráfego excessivo

### Path Traversal / LFI
- ✅ Detecção de `../` nas URLs
- ✅ Honeypot paths retornam 404 silencioso

### Scanner / Pentest tools
- ✅ Bloqueio por User-Agent (sqlmap, nikto, burpsuite, etc.)
- ✅ Honeypots: qualquer acesso a `/wp-admin`, `/.env`, `/phpmyadmin` etc. é bloqueado

---

## 📋 Checklist de segurança — Revisão mensal

- [ ] Verificar logs do Vercel por tentativas suspeitas (Vercel → Logs)
- [ ] Verificar alertas do GitHub Dependabot (dependências desatualizadas)
- [ ] Verificar MongoDB Atlas Activity Log
- [ ] Testar se HTTPS está funcionando: https://acquaxcontrol.com.br
- [ ] Verificar headers de segurança: https://securityheaders.com/?q=acquaxcontrol.com.br
- [ ] Verificar SSL: https://www.ssllabs.com/ssltest/

---

## 🆘 Se o sistema for hackeado — Plano de resposta

### Passo 1 — Isolar
```
1. No Vercel: desativar o projeto (Settings → Danger → Disable project)
   OU redirecionar para página de manutenção
```

### Passo 2 — Revogar credenciais
```
1. MongoDB: trocar senha do usuário DB imediatamente
2. Vercel: revogar todos os tokens de API (Settings → Tokens)
3. JWT_SECRET: gerar novo e atualizar no Vercel
4. GitHub: revogar deploy keys suspeitas
```

### Passo 3 — Investigar
```
1. Vercel Logs → filtrar por status 200 em endpoints sensíveis
2. MongoDB Atlas Activity Log → verificar operações incomuns
3. GitHub → verificar commits e acessos recentes
```

### Passo 4 — Restaurar
```
Seguir o MASTER_BACKUP_RESTAURACAO.md com as credenciais novas
```

### Passo 5 — Notificar
```
Se dados de usuários foram expostos, notificar os moradores por email
(obrigação legal pela LGPD — Lei 13.709/2018)
```

---

*Última atualização: 07/03/2026*
