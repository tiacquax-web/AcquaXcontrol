# 🔐 ACQUAXCONTROL — GUIA MASTER DE BACKUP E RESTAURAÇÃO
> **Data de geração:** 07/03/2026  
> **Versão do sistema:** Commit `812788a` (branch `principal`)  
> **Repositório:** https://github.com/tiacquax-web/AcquaXcontrol  
> **Domínio de produção:** https://acquaxcontrol.com.br  
> **Deploy:** Vercel (conta tiacquax-web)

---

## ⚠️ LEIA PRIMEIRO — O QUE VOCÊ PRECISA GUARDAR EM LOCAL SEGURO

Estas 3 coisas são **CRÍTICAS** e devem estar salvas em local seguro (ex: cofre de senha como 1Password/Bitwarden):

| Item | Valor | Onde usar |
|------|-------|-----------|
| MongoDB Atlas URI | `mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol` | Variável `DATABASE_URL` no Vercel |
| JWT Secret | `acquax-super-secret-jwt-key-2024` | Variável `JWT_SECRET` no Vercel |
| GitHub | https://github.com/tiacquax-web/AcquaXcontrol | Código-fonte |

> ⚠️ **IMPORTANTE:** O JWT_SECRET atual é fraco. Após restaurar, gere um novo com: `openssl rand -base64 64`

---

## 🏗️ ARQUITETURA DO SISTEMA

```
AcquaXControl
├── Frontend + Backend: Next.js 15 (App Router)
├── Banco de dados: MongoDB Atlas (cloud)
├── ORM: Prisma 6.x
├── Deploy: Vercel (serverless)
├── Domínio: acquaxcontrol.com.br
├── CDN de fotos: cdn.acquaxcontrol.com.br
└── Autenticação: JWT via cookie httpOnly "session"
```

### Stack completa
- **Framework:** Next.js 15.3.8 + React 19
- **Linguagem:** TypeScript 5
- **Estilo:** Tailwind CSS 3 + shadcn/ui
- **Banco:** MongoDB Atlas (cluster `acquaxcontrol.gtkok07.mongodb.net`)
- **ORM:** Prisma 6.9.0
- **Autenticação:** JWT (jose + jsonwebtoken) + bcryptjs
- **Gráficos:** Recharts 2.15
- **Email:** Nodemailer (Gmail SMTP)
- **Animações:** Framer Motion 12
- **Deploy:** Vercel (Node.js serverless functions)

---

## 🔑 VARIÁVEIS DE AMBIENTE COMPLETAS

Copie isso exatamente no painel do Vercel em **Settings → Environment Variables**:

```env
# === BANCO DE DADOS ===
DATABASE_URL="mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol"

# === AUTENTICAÇÃO ===
JWT_SECRET="acquax-super-secret-jwt-key-2024"
# ⚠️ TROQUE O JWT_SECRET POR UM MAIS FORTE! Use: openssl rand -base64 64

# === URLs DA APLICAÇÃO ===
NEXT_PUBLIC_BASE_URL="https://acquaxcontrol.com.br"
NEXT_PUBLIC_API_URL="https://acquaxcontrol.com.br/api"

# === EMAIL (para recuperação de senha) ===
EMAIL_USER="seu-email@gmail.com"
EMAIL_PASS="sua-senha-de-app-gmail"
# Como criar senha de app Gmail:
# 1. Acesse myaccount.google.com → Segurança → Verificação em 2 etapas
# 2. Role até "Senhas de app" → Gerar → copie a senha de 16 dígitos
```

---

## 🚀 COMO RESTAURAR DO ZERO (passo a passo)

### Pré-requisitos
- Conta GitHub (ou acesso ao repositório)
- Conta Vercel (vercel.com)
- Acesso ao MongoDB Atlas (cloud.mongodb.com)
- Node.js 20+ instalado localmente (opcional, só para dev local)

---

### PASSO 1 — Clonar o repositório

```bash
git clone https://github.com/tiacquax-web/AcquaXcontrol.git
cd AcquaXcontrol
git checkout principal
```

---

### PASSO 2 — Configurar variáveis de ambiente (desenvolvimento local)

```bash
# Crie o arquivo .env na raiz do projeto
cat > .env << 'EOF'
DATABASE_URL="mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol"
JWT_SECRET="acquax-super-secret-jwt-key-2024"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
EMAIL_USER="seu-email@gmail.com"
EMAIL_PASS="sua-senha-de-app"
EOF
```

---

### PASSO 3 — Instalar dependências e gerar Prisma

```bash
npm install
npx prisma generate
```

---

### PASSO 4 — Rodar em desenvolvimento

```bash
npm run dev
# Acesse: http://localhost:3000
```

---

### PASSO 5 — Deploy no Vercel (produção)

#### 5a. Via interface web (mais fácil):
1. Acesse https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Conecte com GitHub e selecione `tiacquax-web/AcquaXcontrol`
4. Em **"Configure Project"**:
   - Framework Preset: **Next.js**
   - Build Command: `npx prisma generate && next build`
   - Output Directory: `.next`
5. Em **"Environment Variables"**, adicione todas as variáveis da seção acima
6. Clique **Deploy**

#### 5b. Via CLI Vercel:
```bash
npm install -g vercel
vercel login
vercel --prod
# Siga as instruções e configure as env vars quando solicitado
```

---

### PASSO 6 — Configurar domínio acquaxcontrol.com.br no Vercel

1. No painel Vercel → projeto → **Settings → Domains**
2. Adicione: `acquaxcontrol.com.br`
3. Adicione: `www.acquaxcontrol.com.br`
4. O Vercel mostrará registros DNS para configurar:
   - Tipo **A** → `76.76.21.21`
   - Tipo **CNAME** `www` → `cname.vercel-dns.com`
5. Configure esses registros no painel do seu registrador de domínio (Registro.br, Hostgator, etc.)
6. Aguarde propagação DNS (pode levar até 48h, geralmente menos de 1h)
7. O Vercel provisiona SSL/HTTPS automaticamente via Let's Encrypt

---

### PASSO 7 — Verificar MongoDB Atlas

1. Acesse https://cloud.mongodb.com
2. Login com a conta vinculada ao projeto
3. Vá em **Network Access** → verifique se `0.0.0.0/0` (acesso de qualquer IP) está configurado
   - Isso é necessário porque o Vercel usa IPs dinâmicos
4. Vá em **Database Access** → verifique usuário `ruivagiulia_db_user` com permissão `readWrite`
5. Em **Databases** → verifique banco `acquax` com as coleções

---

## 📁 ESTRUTURA DE PASTAS DO PROJETO

```
AcquaXcontrol/
├── app/
│   ├── (main)/              # Páginas protegidas (requer login)
│   │   ├── dashboard/       # Página inicial (morador/admin)
│   │   ├── meter-report/    # Filipeta Medição
│   │   ├── readings/        # Leituras dos medidores
│   │   ├── apartments/      # Gestão de apartamentos
│   │   ├── blocks/          # Gestão de blocos
│   │   ├── complexes/       # Gestão de condomínios
│   │   ├── companies/       # Gestão de administradoras
│   │   ├── users/           # Gestão de usuários
│   │   ├── roles/           # Gestão de permissões
│   │   ├── meters/          # Gestão de medidores
│   │   ├── devices/         # Gestão de dispositivos IoT
│   │   ├── dealership-readings/ # Leituras da concessionária
│   │   ├── monitoring/      # Monitoramento em tempo real
│   │   ├── reservoirs/      # Gestão de reservatórios
│   │   ├── reservoir-monitoring/ # Monitoramento reservatórios
│   │   └── account/         # Conta do usuário
│   ├── api/                 # API Routes (Next.js)
│   │   ├── auth/            # Login, logout, contexto, senha
│   │   ├── meter-report/    # API filipetas
│   │   ├── dealership-readings/ # API concessionária
│   │   ├── monitoring/      # API monitoramento
│   │   ├── reservoir-readings/  # API reservatórios
│   │   └── reservoirs/      # API reservatórios
│   ├── login/               # Página de login (pública)
│   ├── signup/              # Cadastro (pública)
│   └── first-access/        # Primeiro acesso / trocar senha
├── components/              # Componentes React reutilizáveis
├── hooks/                   # React hooks customizados
├── lib/                     # Utilitários (auth, prisma, etc.)
├── prisma/
│   └── schema.prisma        # Schema do banco MongoDB
├── public/                  # Arquivos estáticos
├── services/                # Camada de serviços (chamadas API)
├── types/                   # TypeScript types
├── middleware.ts             # Autenticação + segurança (edge)
├── next.config.ts           # Configuração Next.js
└── vercel.json              # Configuração Vercel
```

---

## 🗄️ BANCO DE DADOS — MODELOS PRINCIPAIS

| Coleção | Descrição |
|---------|-----------|
| `User` | Usuários do sistema |
| `Session` | Sessões de login ativas |
| `Role` | Perfis de permissão (morador, síndico, admin, etc.) |
| `UserRoleAssignment` | Vínculo usuário ↔ perfil ↔ entidade |
| `Company` | Administradoras |
| `Complex` | Condomínios |
| `Block` | Blocos dentro do condomínio |
| `Apartment` | Apartamentos |
| `Meter` | Medidores de água |
| `Reading` | Leituras dos medidores |
| `ApartmentConsumptionReport` | Relatório mensal por unidade (filipeta) |
| `DealershipReading` | Leituras da concessionária de água |
| `Reservoir` | Reservatórios |
| `ReservoirReading` | Leituras dos reservatórios |
| `IoTDevice` | Dispositivos IoT conectados |

---

## 🔄 BACKUP DO BANCO DE DADOS (MongoDB)

### Backup manual via MongoDB Atlas (interface web):
1. Acesse cloud.mongodb.com → seu cluster
2. Vá em **...** (três pontos) → **Command Line Tools**
3. Use `mongodump`:
```bash
mongodump --uri="mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax" --out=./backup-$(date +%Y%m%d)
```

### Restaurar banco:
```bash
mongorestore --uri="mongodb+srv://USUARIO:SENHA@HOST/acquax" ./backup-20260307/acquax
```

### Backup automático (já ativo no Atlas Free Tier):
- MongoDB Atlas Free Tier mantém snapshots automáticos por 2 dias
- Para retenção maior, considere upgrade para M10+ (pago)

---

## 👤 USUÁRIOS PADRÃO DO SISTEMA

O sistema usa perfis de acesso baseados em `Role`:

| Perfil | Acesso |
|--------|--------|
| `system` | Acesso total (programador/superadmin) |
| `company` | Gestão da administradora |
| `complex` | Síndico — gestão do condomínio |
| `block` | Gestão de bloco |
| `apartment` | Morador — acesso à própria unidade |

Para criar o primeiro usuário administrador após restaurar:
1. Acesse `/signup` e crie a conta
2. No MongoDB Atlas, edite o usuário e adicione um `UserRoleAssignment` com `entity: "system"`

---

## 🔒 SEGURANÇA — CHECKLIST PÓS-RESTAURAÇÃO

- [ ] Trocar o `JWT_SECRET` por uma chave forte (mínimo 64 chars)
- [ ] Verificar que `.env` está no `.gitignore` (NÃO commitar)
- [ ] Revogar e gerar novas credenciais MongoDB se suspeitar de vazamento
- [ ] Verificar HTTPS ativo no domínio
- [ ] Confirmar headers de segurança ativos (CSP, HSTS, etc.)
- [ ] Verificar rate limiting no middleware
- [ ] Ativar autenticação de 2 fatores no GitHub
- [ ] Ativar autenticação de 2 fatores no Vercel
- [ ] Ativar autenticação de 2 fatores no MongoDB Atlas

---

## 📞 SUPORTE TÉCNICO

- **Repositório:** https://github.com/tiacquax-web/AcquaXcontrol
- **Deploy atual:** https://acquaxcontrol.com.br (Vercel)
- **Banco:** MongoDB Atlas — cluster `acquaxcontrol.gtkok07.mongodb.net`
- **Projeto Vercel:** Buscar em vercel.com/tiacquax-web

---

*Este documento foi gerado em 07/03/2026. Mantenha-o atualizado após grandes mudanças no sistema.*
