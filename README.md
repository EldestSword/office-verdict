# Office Verdict

A small office voting app hosted on Netlify with Supabase storage.

## V2 features

- remembers each voter on their browser after the first name selection;
- no voter PINs;
- one live voting round at a time, with 30-minute, hourly, multi-hour or manual closing;
- optional scheduled openings;
- optional anonymous comments attached to votes;
- public top-three cards and full result history;
- reusable question bank and random question launcher;
- bulk import of up to 1,000 questions at once;
- included starter CSV containing 240 office-safe questions;
- admin comment moderation;
- leaderboard, category, turnout and round reporting;
- detailed CSV export;
- Netlify Functions keep the Supabase secret key out of the browser.

## Required Netlify environment variables

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_PASSWORD
AWS_LAMBDA_JS_RUNTIME=nodejs24.x
```

The secret key and admin password should be marked as secret values and set for the Production context.

## V2 release

Read [`docs/V2_SETUP.md`](docs/V2_SETUP.md) before deploying. The Supabase migration must be run before the V2 code is released.

## Local development

```bash
npm install
npm run dev
```

## Security and privacy

The browser never receives the Supabase secret key. Database tables use Row Level Security with no direct public policies. Public results show totals and anonymous comments only. The administrator can see individual voter records for moderation and export purposes.
