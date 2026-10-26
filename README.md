THIS IS SE-MINI PROJECT BY:
1)SHRAVANI MALLUR(PES1UG24CS621)
2)ARJUN BHAT(PES1UG24CS655)
3)AMOGH HERLE(PES1UG24CS653)

## Getting Started

Stack: Next.js 14 (App Router) + PostgreSQL + Prisma. See `Documents/` for the SRS, requirements, and architecture docs.

### 1. Install dependencies

```bash
npm install
```

### 2. Start a Postgres database

Any reachable Postgres instance works. If you don't already have one running locally, the quickest way is Docker:

```bash
docker run -d --name ems_pg \
  --restart unless-stopped \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ems \
  -v ems_pg_data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine
```

If port 5432 is already taken on your machine (a native Postgres service, for example), map to a different host port instead, e.g. `-p 5460:5432`, and use that port in `DATABASE_URL` below.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then fill in `.env`:

- **`DATABASE_URL`** (required) — connection string for the Postgres from step 2, e.g. `postgresql://postgres:postgres@localhost:5432/ems`.
- **`SESSION_SECRET`** (required) — any long random string, e.g. `openssl rand -hex 32`. Login will fail without this set; it signs the session cookie.
- **`EMAIL_USER` / `EMAIL_PASS`** (optional) — a Gmail address and an [App Password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification enabled) for sending real signup-verification emails. Leave blank and the app automatically falls back to a disposable Ethereal test inbox — sent mail won't reach a real address, but the dev server console logs a preview URL for each email so you can still open and click the link.

### 4. Push the schema and generate the Prisma client

```bash
npx prisma generate
npx prisma db push
```

### 5. Run the dev server

```bash
npm run dev
```

Opens on `http://localhost:3000`.

## Running the tests

Unit tests (mocked DB, no Postgres needed):

```bash
npm test
```

Live integration scripts under `scripts/` exercise the real API against a running dev server and a real Postgres (steps 2–5 above must already be done, and `npm run dev` running in another terminal). Each needs `DATABASE_URL` and `SESSION_SECRET` in its shell environment and takes an optional `BASE_URL` (defaults to `http://localhost:3000`):

```bash
# one that has an npm script alias:
npm run test:fr004a

# any other script in scripts/, run directly with ts-node:
npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr002a.ts
npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr003a.ts
npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr005a.ts
```
