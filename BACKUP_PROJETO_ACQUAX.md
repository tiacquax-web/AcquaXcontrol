# 📦 BACKUP COMPLETO — AcquaX Control
**Data do backup:** 07/03/2026  
**Gerado por:** Genspark AI  

---

## 📌 ÍNDICE
1. [Informações do Projeto](#1-informações-do-projeto)
2. [Credenciais e Acessos](#2-credenciais-e-acessos)
3. [Variáveis de Ambiente (.env)](#3-variáveis-de-ambiente-env)
4. [Banco de Dados (MongoDB Atlas)](#4-banco-de-dados-mongodb-atlas)
5. [Repositório GitHub](#5-repositório-github)
6. [Deploy — Vercel](#6-deploy--vercel)
7. [Configurações de Arquivos-Chave](#7-configurações-de-arquivos-chave)
8. [Stack Tecnológica](#8-stack-tecnológica)
9. [Estrutura de Pastas](#9-estrutura-de-pastas)
10. [Histórico de Correções Aplicadas](#10-histórico-de-correções-aplicadas)
11. [Como Restaurar / Rodar Localmente](#11-como-restaurar--rodar-localmente)

---

## 1. Informações do Projeto

| Campo | Valor |
|-------|-------|
| **Nome** | AcquaX Control |
| **Versão** | 0.1.0 |
| **Framework** | Next.js 15.3.8 (App Router) |
| **Banco** | MongoDB Atlas |
| **ORM** | Prisma 6.9.0 |
| **Deploy** | Vercel (Hobby) |
| **Domínio produção** | https://acqua-xcontrol.vercel.app |
| **Domínio customizado** | https://www.acquaxcontrol.com.br *(DNS pendente)* |
| **Repositório** | https://github.com/tiacquax-web/AcquaXcontrol |
| **Branch principal** | `principal` |

---

## 2. Credenciais e Acessos

### 🔐 Usuário Administrador (sistema)
| Campo | Valor |
|-------|-------|
| **Email** | admin@acquax.com |
| **Senha** | Admin@123456 |
| **Nome** | Administrador |
| **Role** | Administrador (system) |
| **ID** | afb2c57c-fcb1-4cb0-b021-68a813c298e9 |

### 👤 Outros Usuários Cadastrados
| Nome | Email | Role | Contexto |
|------|-------|------|----------|
| Jefferson | sistema@acquaxdobrasil.com.br | Programador | system |
| testeb1-a1 | testeb1-a1@teste | Morador | apartment |
| sindicoteste | sindicoteste@teste.com.br | Síndico | complex (Teste) |

### 🍃 MongoDB Atlas
| Campo | Valor |
|-------|-------|
| **Cluster** | acquaxcontrol.gtkok07.mongodb.net |
| **Database** | acquax |
| **Usuário DB** | ruivagiulia_db_user |
| **Senha DB** | MUWnoaseItSukxnY |
| **App Name** | acquaxcontrol |
| **Acesso de rede** | 0.0.0.0/0 (liberado para Vercel) |
| **Console** | https://cloud.mongodb.com |

### 🐙 GitHub
| Campo | Valor |
|-------|-------|
| **Conta** | tiacquax-web |
| **Repositório** | AcquaXcontrol |
| **URL** | https://github.com/tiacquax-web/AcquaXcontrol |

### 🚀 Vercel
| Campo | Valor |
|-------|-------|
| **Projeto** | acqua-xcontrol |
| **URL** | https://vercel.com/tiacquax-web/acqua-xcontrol |
| **Framework detectado** | Next.js |

### 📧 Email (Nodemailer — recuperação de senha)
| Campo | Valor |
|-------|-------|
| **EMAIL_USER** | ti.acquax@gmail.com |
| **EMAIL_PASS** | Giulia@Acquax2026!! |

---

## 3. Variáveis de Ambiente (.env)

### `.env` local (sandbox/desenvolvimento)
```env
# Banco de dados MongoDB Atlas
DATABASE_URL="mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol"

# JWT Secret para autenticação
JWT_SECRET="acquax-super-secret-jwt-key-2024"

# URL da aplicação (local/sandbox)
NEXT_PUBLIC_BASE_URL="http://localhost:3001"
NEXT_PUBLIC_API_URL="http://localhost:3001/api"

# Email (nodemailer) - recuperação de senha
EMAIL_USER="ti.acquax@gmail.com"
EMAIL_PASS="Giulia@Acquax2026!!"
```

### Variáveis de Ambiente na Vercel (produção)
> Configurar em: Vercel → Settings → Environment Variables

| Nome | Valor |
|------|-------|
| `DATABASE_URL` | `mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol` |
| `JWT_SECRET` | `acquax-super-secret-jwt-key-2024` |
| `NEXT_PUBLIC_BASE_URL` | `https://acqua-xcontrol.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `https://acqua-xcontrol.vercel.app/api` |
| `EMAIL_USER` | `ti.acquax@gmail.com` |
| `EMAIL_PASS` | `Giulia@Acquax2026!!` |

> ⚠️ **ATENÇÃO:** Os nomes das variáveis devem estar em **inglês** exatamente como acima. Nomes em português (ex: `URL_DO_BANCO_DE_DADOS`) não funcionam.

---

## 4. Banco de Dados (MongoDB Atlas)

### 📊 Contagem de Registros (snapshot 07/03/2026)
| Coleção | Registros |
|---------|-----------|
| user | 4 |
| company | 1 |
| complex | 2 |
| block | 3 |
| apartment | 121 |
| meter | 120 |
| typeMeter | 8 |
| reading | 0 |
| session | 44 |
| role | 5 |
| roleAssignment | 4 |
| dealership | 0 |
| reservoir | 0 |

### 🏢 Empresa
```json
{
  "id": "b4b60a24-e33f-490a-af76-37ec3db1c821",
  "name": "AcquaX do Brasil",
  "socialName": "AcquaX do Brasil Ltda",
  "documentCompany": "00.000.000/0001-00",
  "email": "contato@acquaxcontrol.com.br",
  "telephone": "(27) 3000-0000",
  "cell": "(27) 99000-0000",
  "zipcode": "29100-000",
  "street": "Rua das Águas",
  "number": "100",
  "neighborhood": "Centro",
  "state": "ES",
  "city": "Vila Velha"
}
```

### 🏠 Condomínios (Complexes)
| ID | Nome | Empresa |
|----|------|---------|
| 17bb032c-c012-431d-a5a8-63801b259132 | Diamantina | AcquaX do Brasil |
| f8261d8e-cf18-4e8e-94e9-00812ccdce9f | Teste | *(sem empresa)* |

### 🧱 Blocos (Blocks)
| ID | Nome | Condomínio |
|----|------|-----------|
| 01e3ef11-5f29-4a8e-ba60-864bfe4c2bfa | 1 | Diamantina |
| a7fc1685-9315-4d77-b69a-da7e39431604 | 2 | Diamantina |
| a709f7ab-57b2-4830-b667-2ff869aeab92 | 1 | Teste |

### 🔧 Tipos de Medidor (TypeMeter)
| ID | Nome | Sigla |
|----|------|-------|
| 84581ee9-3a1d-4d8d-868a-4ac9660b166c | Água | AG |
| 7bb358cf-b2e8-4fe4-8704-fdc8e22157dc | Água Quente | AQ |
| 245b485f-3942-4df5-99cb-afcd9b735f7a | Água Fria | AF |
| 2c892d33-999f-4b93-9da0-975def20337e | Gás | GS |
| a101bfaa-f334-428c-8766-ccf449a4f839 | Energia | EN |
| 1f02e5a2-d35b-4399-afe8-19e3bf755f0a | Energia Elétrica | EE |
| cb4f895c-0520-44af-961f-2df158f49c36 | Aquecimento | AH |
| cb2addd0-a7f0-4cf8-b6a8-05c6085f9fbe | Esgoto | ES |

### 👥 Roles (Funções do sistema)
| ID | Nome |
|----|------|
| 7cd537d4-155a-42bb-ab46-718458a500af | Administrador |
| f65cb3c4-6743-4b96-afe1-3cfefc6052dc | Síndico |
| 6d800023-a8ce-44b9-8e30-595c4c09e7ef | Programador |
| 82434ef4-6a35-4024-9318-348889e4b586 | Administradora |
| 603ef536-9348-474f-8aff-3a25fedd0ca6 | Morador |

### 🔗 Atribuições de Permissão (RoleAssignments)
| Usuário | Role | Contexto | Contexto ID |
|---------|------|----------|-------------|
| Administrador | Administrador | system | system |
| Jefferson | Programador | system | system |
| testeb1-a1 | Morador | apartment | eda91525-5ace-4454-8bf5-63a39215e889 |
| sindicoteste | Síndico | complex | f8261d8e (Teste) |

---

## 5. Repositório GitHub

### Últimos commits (07/03/2026)
```
6c8aa19  perf(meters): parallel updates + Bearer auth + middleware fix - 86s→7s import
5aa3b47  Update vercel.json
5539ea1  fix(meters): increase timeout to 60s, remove debug logs, fix refetch after import
e078cab  fix(meters): only refetch after import if context filter is selected
011f2e2  fix(cors): add CORS headers and OPTIONS handler for login API
c17b061  Update vercel.json
c24b562  fix(build): remove allowedDevOrigins from prod config, keep JWT middleware fix
9f00e94  fix(login): corrigir middleware - verificacao JWT local sem fetch externo
84f8607  fix(deploy): force Vercel redeploy with middleware JWT fix + framework config
b593841  fix(middleware): verify JWT locally instead of fetch to avoid slow external call
```

### Clone do repositório
```bash
git clone https://github.com/tiacquax-web/AcquaXcontrol.git
cd AcquaXcontrol
git checkout principal
```

---

## 6. Deploy — Vercel

### `vercel.json`
```json
{
  "buildCommand": "npx prisma generate && next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

### Processo de deploy
> ⚠️ Commits feitos pelo sandbox são **bloqueados** pela Vercel.  
> Para forçar um deploy: edite qualquer arquivo no GitHub e faça commit direto na branch `principal`.

### DNS Cloudflare (domínio acquaxcontrol.com.br)
| Tipo | Nome | Valor | Proxy |
|------|------|-------|-------|
| A | @ | 76.76.21.21 | ❌ OFF |
| CNAME | www | cname.vercel-dns.com | ❌ OFF |
| TXT | _vercel | *(valor fornecido pela Vercel)* | — |

---

## 7. Configurações de Arquivos-Chave

### `next.config.ts`
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, Cookie' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.acquaxcontrol.com.br', pathname: '/**' },
      { protocol: 'https', hostname: 'www.acquaxcontrol.com.br', pathname: '/**' },
    ],
  },
};

export default nextConfig;
```

### `middleware.ts`
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Todas as rotas /api/ passam direto (autenticação feita internamente)
  if (pathname.startsWith('/api/')) return NextResponse.next();

  // Rotas estáticas e públicas
  const publicPaths = ['/_next', '/favicon.ico', '/recover', '/politica-de-privacidade',
    '/logo-acquax.png', '/manifest.webmanifest', '/sw.js', '/offline', '/icons',
    '/.well-known', '/screenshots'];
  if (publicPaths.some(p => pathname.startsWith(p))) return NextResponse.next();

  const authPaths = ['/login', '/signup', '/first-access'];
  const isAuthPath = authPaths.some(p => pathname.startsWith(p));
  const isRootPath = pathname === '/';
  const token = req.cookies.get('session')?.value;

  if (!token) {
    if (isAuthPath) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const mustUpdate = (payload as any).mustUpdateCredentials;
    if (mustUpdate && !pathname.startsWith('/first-access')) {
      return NextResponse.redirect(new URL('/first-access', req.url));
    }
    if (isAuthPath || isRootPath) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set('session', '', { path: '/', maxAge: 0 });
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### `lib/users.ts` — `validateUserSession` (aceita Bearer + Cookie)
```typescript
export async function validateUserSession(req: NextRequest) {
  // 1. Cookie de sessão (browser)
  const sessionCookie = req.cookies.get('session')?.value;
  if (sessionCookie) {
    const validSession = await isSessionValid(sessionCookie);
    if (validSession) return { userId: validSession.userId, error: null, status: 200 };
  }

  // 2. Bearer token JWT (Axios/API calls)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7);
    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024');
      const { payload } = await jwtVerify(jwtToken, secret);
      const userId = payload.userId as string;
      if (userId) return { userId, error: null, status: 200 };
    } catch {}
  }

  return { userId: null, error: 'Unauthorized', status: 401 };
}
```

### `app/api/(public)/user/(consumption)/meters/route.ts` — Configurações importantes
```typescript
// Timeout estendido (Vercel Hobby suporta até 60s)
export const maxDuration = 60;

// Updates em paralelo (Promise.all) — 120 registros em ~7s
const updatePromises = toUpdate.map(item =>
  prisma.meter.update({ where: { id: item.existingId }, data: updateData })
);
const results = await Promise.all(updatePromises);
```

---

## 8. Stack Tecnológica

### Core
| Tecnologia | Versão |
|-----------|--------|
| Next.js | 15.3.8 |
| React | 19.0.0 |
| TypeScript | *(via Next.js)* |
| Prisma | 6.9.0 |
| MongoDB | 7.1.0 |

### Autenticação
| Pacote | Versão | Uso |
|--------|--------|-----|
| jsonwebtoken | 9.0.2 | Geração de JWT no login |
| jose | *(next.js dep)* | Verificação JWT no middleware/Edge |
| bcryptjs | 3.0.2 | Hash de senhas |

### UI / Frontend
| Pacote | Versão |
|--------|--------|
| @radix-ui/* | vários |
| tailwindcss-animate | 1.0.7 |
| framer-motion | 12.4.7 |
| recharts | 2.15.0 |
| lucide-react | 0.471.2 |
| react-hook-form | 7.54.2 |
| zod | 3.24.2 |

### Utilitários
| Pacote | Uso |
|--------|-----|
| axios | Chamadas de API do frontend |
| xlsx | Leitura de planilhas Excel |
| nodemailer | Envio de emails |
| date-fns | Manipulação de datas |
| uuid | Geração de IDs |

---

## 9. Estrutura de Pastas

```
/home/user/webapp/
├── app/
│   ├── (main)/              # Páginas autenticadas
│   │   ├── dashboard/
│   │   ├── meters/          # Gestão de medidores
│   │   ├── users/
│   │   ├── readings/
│   │   └── ...
│   ├── api/
│   │   ├── auth/
│   │   │   └── login/       # POST /api/auth/login
│   │   └── (public)/
│   │       └── user/
│   │           └── (consumption)/
│   │               └── meters/   # GET/POST /api/user/meters
│   ├── login/
│   ├── signup/
│   └── first-access/
├── components/              # Componentes React reutilizáveis
│   ├── import-meters-dialog.tsx
│   └── ui/                  # Componentes shadcn/ui
├── hooks/                   # Custom React hooks
│   ├── useAuth.ts
│   └── useMeters.ts
├── lib/
│   ├── prisma.ts            # Cliente Prisma + cleanEntityBody
│   ├── users.ts             # Funções de usuário + validateUserSession
│   ├── userData.ts          # CRUD genérico (createEntity, bulkCreateEntity...)
│   └── userContexts.ts      # Verificação de permissões por contexto
├── services/                # Chamadas de API do frontend (axios)
│   ├── authService.ts
│   └── metersService.ts
├── prisma/
│   └── schema.prisma        # Schema completo do banco (1448 linhas)
├── middleware.ts             # Autenticação de rotas Next.js
├── next.config.ts
├── vercel.json
├── .env                     # Variáveis locais (NÃO commitado)
└── package.json
```

---

## 10. Histórico de Correções Aplicadas

### 🔐 Login / Autenticação
| Data | Problema | Solução |
|------|----------|---------|
| 07/03 | Login não entrava (loading infinito) | Middleware fazia fetch externo para `/api/auth/session`; substituído por verificação JWT local com `jose` |
| 07/03 | API retornava 401 para chamadas Axios | `validateUserSession` só aceitava cookie; adicionado suporte a `Authorization: Bearer` |
| 07/03 | Middleware bloqueava rotas `/api/*` | Todas as rotas `/api/` liberadas no middleware; autenticação feita internamente em cada rota |

### 📥 Importação de Medidores
| Data | Problema | Solução |
|------|----------|---------|
| 07/03 | "Nenhum contexto válido" após import | `refetch()` chamado sem filtro; condicionado a existência de filtro selecionado |
| 07/03 | Import travado em 0% | Updates sequenciais individuais (~0,7s/registro); substituído por `Promise.all` paralelo |
| 07/03 | Timeout na Vercel (>10s) | `maxDuration = 60` adicionado; tempo caiu de 86s → 7s |
| 07/03 | 401 na chamada de import | `validateUserSession` não aceitava Bearer token do Axios |

### 🌐 Deploy / Infraestrutura
| Data | Problema | Solução |
|------|----------|---------|
| 07/03 | Variáveis Vercel em português | Renomeadas: `URL_DO_BANCO_DE_DADOS` → `DATABASE_URL`, etc. |
| 07/03 | MongoDB bloqueava IPs da Vercel | `0.0.0.0/0` adicionado no Network Access do Atlas |
| 07/03 | CORS bloqueando chamadas Axios | Headers CORS adicionados em `next.config.ts` + handler OPTIONS no login |

---

## 11. Como Restaurar / Rodar Localmente

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta MongoDB Atlas (ou usar a string de conexão acima)

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/tiacquax-web/AcquaXcontrol.git
cd AcquaXcontrol
git checkout principal

# 2. Instalar dependências
npm install

# 3. Criar arquivo .env na raiz
cat > .env << 'EOF'
DATABASE_URL="mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol"
JWT_SECRET="acquax-super-secret-jwt-key-2024"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
EMAIL_USER="ti.acquax@gmail.com"
EMAIL_PASS="Giulia@Acquax2026!!"
EOF

# 4. Gerar cliente Prisma
npx prisma generate

# 5. Rodar em desenvolvimento
npm run dev

# 6. Acessar
# http://localhost:3000/login
# Email: admin@acquax.com
# Senha: Admin@123456
```

### Deploy na Vercel (do zero)
```bash
# 1. Instalar Vercel CLI
npm install -g vercel

# 2. Fazer login
vercel login

# 3. Deploy
vercel --prod

# 4. Configurar variáveis de ambiente na Vercel
# Vercel Dashboard → Settings → Environment Variables
# Adicionar todas as variáveis da seção 3
```

### Comandos úteis
```bash
# Ver dados do banco
npx prisma studio

# Rodar seed (se existir)
npx prisma db seed

# Verificar conexão com MongoDB
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then(n => { console.log('Users:', n); p.\$disconnect(); });
"
```

---

## ⚠️ Notas Importantes

1. **Sandbox (novita.ai):** O ambiente sandbox é temporário — os arquivos existem apenas durante a sessão. O código real está no GitHub.

2. **Vercel Hobby:** O plano gratuito tem timeout de 10s por função. Com `maxDuration = 60` no código, o import de 120 medidores leva ~7s (ok). Se crescer muito, considerar upgrade para Pro.

3. **JWT_SECRET:** O valor `acquax-super-secret-jwt-key-2024` é funcional mas não ideal para produção. Recomenda-se trocar por uma string mais longa e aleatória.

4. **Commits do sandbox:** Commits feitos pela IA no sandbox são marcados com email `genspark_dev@genspark.ai` e ficam **bloqueados** na Vercel. Para desbloquear, sempre fazer um commit manual no GitHub após cada sessão de desenvolvimento.

5. **Domínio acquaxcontrol.com.br:** Configurar DNS no Cloudflare conforme tabela na seção 6. Os registros A e CNAME devem ter proxy **desligado** (nuvem cinza) para que a Vercel valide o SSL.

---

*Backup gerado automaticamente em 07/03/2026 pela Genspark AI*
