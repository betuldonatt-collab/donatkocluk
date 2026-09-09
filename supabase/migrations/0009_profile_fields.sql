-- Student profile page fields. All nullable (a student fills these in
-- gradually), except the four yes/no academic-status flags which default
-- false rather than null -- they're rendered as switches, and a switch
-- needs a concrete starting state.
alter table public.profiles
  -- Read-only system info -- set by a coach/admin (no such UI yet; these
  -- columns exist so the student profile page has something to display
  -- and so a future coach/admin panel has somewhere to write to).
  add column coaching_start_date date,
  add column assigned_meeting_day text,

  -- Kişisel Bilgiler
  add column city text,
  add column phone text,
  add column parent_name text,
  add column parent_phone text,

  -- Akademik Hedefler
  add column target_university text,
  add column target_department text,
  -- Free text, not int: students commonly state a range ("50.000-60.000"),
  -- not a single number.
  add column target_ranking text,

  -- Akademik Durum
  add column school_name text,
  add column obp numeric,
  add column attends_dershane boolean not null default false,
  add column attends_deneme_kulubu boolean not null default false,
  add column has_private_tutor boolean not null default false,
  add column had_previous_coaching boolean not null default false,
  add column previous_yks_ranking text,

  -- Ders Analizi
  add column favorite_subjects text,
  add column difficult_subjects text;

-- profiles_update_own lets a student write any column on their own row --
-- fine for everything above, but coaching_start_date/assigned_meeting_day
-- are meant to be coach/admin-set "system info", read-only from the
-- student's side. RLS can't restrict *which* columns an UPDATE touches,
-- so (same pattern as prevent_self_role_change) a trigger does it.
create function public.prevent_student_system_field_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.coaching_start_date is distinct from old.coaching_start_date
      or new.assigned_meeting_day is distinct from old.assigned_meeting_day
    then
      raise exception 'Only an admin can change coaching_start_date or assigned_meeting_day';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_system_field_tampering
  before update on public.profiles
  for each row execute function public.prevent_student_system_field_tampering();
