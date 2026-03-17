# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

AcquaX Control is a single Next.js 15 application (App Router) for water/gas consumption management in Brazilian condominiums. It uses MongoDB (via Prisma ORM) for persistence and custom JWT-based authentication. See `README.md` and `package.json` for standard commands (`npm run dev`, `npm run build`, `npm run lint`).

### MongoDB (required)

MongoDB must run as a **replica set** (`rs0`) because Prisma requires transactions support. Start it with:

```bash
mkdir -p /tmp/mongodb/data
mongod --dbpath /tmp/mongodb/data --port 27017 --bind_ip 127.0.0.1 --replSet rs0 --fork --logpath /tmp/mongodb/mongod.log
mongosh --quiet --eval "try { rs.status() } catch(e) { rs.initiate() }"
```

The `.env` `DATABASE_URL` must include `replicaSet=rs0`:

```
DATABASE_URL="mongodb://127.0.0.1:27017/acquax?replicaSet=rs0"
```

### Database seeding (first-time only)

After MongoDB is running, seed admin user and roles:

```bash
node scripts/seed-admin.js
node scripts/seed-roles.js
node scripts/seed-admin-permissions.js
```

Default admin credentials: `admin@acquax.com` / `Admin@123456`

### Dev server

```bash
npm run dev
```

Starts on port 3000. The `NODE_OPTIONS='--max-old-space-size=512'` in `package.json` may cause OOM in memory-constrained environments; if the dev server crashes with heap allocation errors, set `NODE_OPTIONS='--max-old-space-size=1024'` in the environment before running.

### Lint

```bash
npm run lint
```

The codebase has pre-existing `@typescript-eslint/no-explicit-any` warnings. ESLint is configured to ignore errors during builds (`next.config.ts` has `ignoreDuringBuilds: true`).

### Environment variables

Copy `.env.example` to `.env` for reference. Required vars for local dev:
- `DATABASE_URL` — MongoDB connection string (must include `replicaSet=rs0`)
- `JWT_SECRET` — any string for JWT signing

Optional:
- `EMAIL_USER` / `EMAIL_PASS` — only needed for password recovery emails via Gmail SMTP
