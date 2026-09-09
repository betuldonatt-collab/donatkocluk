-- Adds "Yakınlık Durumu" (relationship, e.g. Anne/Baba/Kardeş) alongside
-- the existing emergency contact name/phone on coach_profiles.
alter table public.coach_profiles
  add column emergency_contact_relationship text;
