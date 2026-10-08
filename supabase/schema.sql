create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  whatsapp text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Casa',
  cep text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('Essencial Amazônico','Experiência Amazônica')),
  frequency text not null check (frequency in ('Mensal','Bimestral','Edição avulsa')),
  grind text not null,
  status text not null default 'draft' check (status in ('draft','pending_payment','payment_failed','active','paused','cancelled')),
  price_cents integer,
  payment_provider text,
  preference_id text,
  payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.subscriptions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select, insert, update on public.subscriptions to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "addresses_select_own" on public.addresses for select to authenticated using ((select auth.uid()) = user_id);
create policy "addresses_insert_own" on public.addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "addresses_update_own" on public.addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "addresses_delete_own" on public.addresses for delete to authenticated using ((select auth.uid()) = user_id);
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "subscriptions_insert_own" on public.subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "subscriptions_update_own" on public.subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
