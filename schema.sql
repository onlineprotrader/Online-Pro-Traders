-- ONLINE PRO TRADER — Supabase schema
-- Run in Supabase SQL Editor before using sign-up / access control.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  approved boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can read their own profile; only the server-side policies allow admin writes.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
for select to authenticated
using (auth.uid() = id);

-- Profile rows are created automatically after sign-up and cannot set approved=true themselves.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, approved, expires_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    false,
    null
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Admin access changes are performed through a trusted server/Edge Function in production.
-- This starter's client-side admin writes are blocked by RLS unless you add a secure admin function.
-- Do NOT add a public policy allowing arbitrary users to update profiles.
