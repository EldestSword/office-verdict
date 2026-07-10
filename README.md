# Office Verdict

A small daily office voting app. One question is scheduled for each day, colleagues vote anonymously, results appear after the configured reveal time, and an admin page provides scheduling, PIN management, reporting and CSV export.

## What is included

- Netlify-hosted static front end
- Netlify Functions for all database access
- Supabase PostgreSQL storage
- One vote per person per question
- No self-voting
- Vote changes allowed until results are revealed
- Name plus four-digit PIN voting
- Results hidden until 4pm London time unless revealed manually
- Admin question scheduling
- Team member activation and PIN reset
- Daily results and historical reporting
- Detailed CSV export for the administrator

## Required Netlify environment variables

Create these in **Site configuration → Environment variables**:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_PASSWORD
```

Never commit real values to this repository.

## Deploy

1. Connect this repository to Netlify.
2. Netlify will detect `netlify.toml` automatically.
3. Add the three environment variables.
4. Trigger a deployment.
5. Open `/admin.html` and sign in with `ADMIN_PASSWORD`.
6. Generate or set PINs for the team.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

## Security model

The browser never receives the Supabase secret key. All reads and writes pass through Netlify Functions. The database tables use Row Level Security with no public policies, while the server-side secret key is stored only in Netlify environment variables.
