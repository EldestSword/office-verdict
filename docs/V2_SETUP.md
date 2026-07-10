# Office Verdict V2 setup

V2 changes the app from one date-based question per day to reusable voting rounds with remembered identity, anonymous comments, public history, bulk question imports and trend reporting.

## Safe release order

1. Keep Netlify automatic builds stopped.
2. Run the V2 Supabase migration in the SQL Editor:
   `supabase/migrations/20260710_v2_rounds_comments_reporting.sql`
3. Confirm the result says `Office Verdict V2 migration completed`.
4. Merge the V2 branch into `main`.
5. Temporarily enable Netlify builds.
6. Trigger one production deployment.
7. Test the public vote, history and admin pages.
8. Stop Netlify builds again.

Do not deploy V2 before running the migration. The V2 functions expect the new database columns.

## Adding hundreds of questions

The admin page has a **Bulk import** tab. It supports:

- one question per line;
- pipe-separated lines in the form `Question | Category | tag1, tag2`;
- CSV files with `question`, `category` and `tags` columns;
- up to 1,000 questions per import;
- automatic skipping of questions already in the database.

A ready-made bank of 240 office-safe questions is included at:

`data/starter-question-bank.csv`

Upload that file from the admin page after V2 is deployed.

## Reporting included

The admin dashboard reports:

- total votes and comments;
- average turnout;
- wins and top-three finishes by person;
- total votes received by person;
- category-level turnout and comment trends;
- turnout across recent rounds;
- completed-round results;
- detailed vote and comment CSV export;
- comment moderation, including the author for admin purposes only.

Public pages never show who wrote a comment or who cast an individual vote.
