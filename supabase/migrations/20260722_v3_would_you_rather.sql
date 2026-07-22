-- OFFICE VERDICT V3
-- Add Would You Rather rounds alongside colleague voting rounds.

begin;

alter table public.questions
  add column if not exists question_type text not null default 'people_vote',
  add column if not exists option_a text,
  add column if not exists option_b text;

alter table public.questions
  drop constraint if exists questions_question_type_check,
  drop constraint if exists questions_wyr_options_check;

alter table public.questions
  add constraint questions_question_type_check
    check (question_type in ('people_vote', 'would_you_rather')),
  add constraint questions_wyr_options_check
    check (
      question_type = 'people_vote'
      or (
        question_type = 'would_you_rather'
        and option_a is not null
        and option_b is not null
        and char_length(btrim(option_a)) between 2 and 180
        and char_length(btrim(option_b)) between 2 and 180
        and lower(btrim(option_a)) <> lower(btrim(option_b))
      )
    );

alter table public.votes
  alter column selected_person_id drop not null,
  add column if not exists selected_option text;

alter table public.votes
  drop constraint if exists votes_selected_option_check,
  drop constraint if exists votes_one_choice_check;

alter table public.votes
  add constraint votes_selected_option_check
    check (selected_option is null or selected_option in ('A', 'B')),
  add constraint votes_one_choice_check
    check (
      (selected_person_id is not null and selected_option is null)
      or (selected_person_id is null and selected_option is not null)
    );

create index if not exists questions_type_status_idx
  on public.questions (question_type, status, created_at desc);

create index if not exists votes_selected_option_idx
  on public.votes (selected_option)
  where selected_option is not null;

insert into public.app_settings (setting_key, setting_value)
values ('wyr_random_weight', '70')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    updated_at = now();

commit;

select
  'Office Verdict V3 Would You Rather migration completed' as result,
  (select count(*) from public.questions where question_type = 'people_vote') as people_questions,
  (select count(*) from public.questions where question_type = 'would_you_rather') as wyr_questions;
