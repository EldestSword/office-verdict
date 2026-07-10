-- Office Verdict V2
-- Adds reusable question bank, multiple voting rounds, anonymous comments and reporting fields.

begin;

-- Multiple questions may now exist on the same day, so the original date uniqueness is removed.
alter table public.questions
  drop constraint if exists questions_scheduled_date_key;

alter table public.questions
  alter column scheduled_date drop not null;

alter table public.questions
  add column if not exists status text not null default 'queued',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists source text not null default 'manual',
  add column if not exists closed_at timestamptz,
  add column if not exists eligible_voters_count integer;

alter table public.questions
  drop constraint if exists questions_status_check;

alter table public.questions
  add constraint questions_status_check
  check (status in ('queued', 'open', 'closed', 'archived'));

-- Map the existing date-based records into the new round model.
update public.questions
set
  status = case
    when is_results_revealed = true or scheduled_date < current_date then 'closed'
    when scheduled_date = current_date then 'open'
    else 'queued'
  end,
  voting_opens_at = coalesce(
    voting_opens_at,
    case when scheduled_date is not null then scheduled_date::timestamptz end
  ),
  voting_closes_at = coalesce(voting_closes_at, results_reveal_at),
  closed_at = case
    when is_results_revealed = true or scheduled_date < current_date
      then coalesce(results_reveal_at, voting_closes_at, updated_at)
    else closed_at
  end
where status = 'queued';

-- At most one live round may be open at once.
create unique index if not exists questions_one_open_round_idx
  on public.questions ((status))
  where status = 'open';

create index if not exists questions_status_created_idx
  on public.questions (status, created_at desc);

create index if not exists questions_opening_idx
  on public.questions (status, voting_opens_at)
  where status = 'queued' and voting_opens_at is not null;

alter table public.votes
  add column if not exists comment_text text,
  add column if not exists comment_hidden boolean not null default false,
  add column if not exists comment_moderated_at timestamptz;

alter table public.votes
  drop constraint if exists votes_comment_length_check;

alter table public.votes
  add constraint votes_comment_length_check
  check (comment_text is null or char_length(comment_text) <= 280);

create index if not exists votes_question_idx
  on public.votes (question_id);

create index if not exists votes_selected_person_idx
  on public.votes (selected_person_id);

insert into public.app_settings (setting_key, setting_value)
values
  ('default_round_minutes', '60'),
  ('comment_max_length', '280'),
  ('public_history_limit', '100')
on conflict (setting_key) do nothing;

commit;

select
  'Office Verdict V2 migration completed' as result,
  (select count(*) from public.people) as people,
  (select count(*) from public.questions) as questions,
  (select count(*) from public.votes) as votes;
