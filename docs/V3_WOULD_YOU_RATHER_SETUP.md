# Office Verdict V3: Would You Rather

V3 adds a second ballot type while preserving the existing Most Likely To rounds.

## What changes

- Most Likely To rounds still show the office members as choices.
- Would You Rather rounds show two large option cards labelled A and B.
- Remembered voter identity and optional anonymous comments work for both types.
- Public history shows colleague rankings for Most Likely To and percentage splits for Would You Rather.
- The colleague leaderboard excludes Would You Rather rounds.
- Separate Would You Rather reporting tracks option totals and the closest splits.
- Weighted random launch favours Would You Rather questions 70% of the time when both types are available and no type filter is selected.
- Bulk import accepts both the original three-column format and the V3 six-column format.

## Safe release order

1. Keep Netlify automatic builds stopped.
2. Run `supabase/migrations/20260722_v3_would_you_rather.sql` in the Supabase SQL Editor.
3. Confirm the result says `Office Verdict V3 Would You Rather migration completed`.
4. Merge `v3-would-you-rather` into `main`.
5. Temporarily enable Netlify builds.
6. Trigger one production deployment.
7. Test one Most Likely To round and one Would You Rather round.
8. Import the Would You Rather question bank through Admin → Bulk import.
9. Stop Netlify builds again.

Do not deploy V3 before running the migration. The V3 functions expect the new question and vote columns.

## V3 CSV format

```csv
question_type,question,option_a,option_b,category,tags
would_you_rather,Would you rather...?,First option,Second option,Category,adult;difficult;debate
people_vote,Who would...?,,,Category,office;chaos
```

The importer also continues to accept the original format:

```csv
question,category,tags
Who would...?,Category,office;chaos
```

## Reporting behaviour

Most Likely To results feed the office leaderboard. Would You Rather rounds are deliberately excluded from that leaderboard because no colleague receives the vote.

Would You Rather reporting includes:

- total completed rounds;
- total Option A and Option B selections;
- percentage splits in public history;
- closest-result rounds;
- turnout and comments by category;
- full detailed CSV export with question type, both options and selected choice.
