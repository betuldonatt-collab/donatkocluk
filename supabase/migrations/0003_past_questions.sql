-- Çıkmış Sorular (past questions): per student, per topic, per year — did
-- they solve that year's past questions for this topic. Same shape as
-- student_resource_progress with `year` in place of `resource_id`, same
-- RLS pattern (own rows only).
create table public.past_question_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  topic_id text not null,
  year int not null,
  solved boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (student_id, topic_id, year)
);

alter table public.past_question_progress enable row level security;
grant select, insert, update on public.past_question_progress to authenticated;

create policy "past_question_progress_own"
  on public.past_question_progress for all
  to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
