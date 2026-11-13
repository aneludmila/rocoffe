-- Execute no SQL Editor do projeto Supabase antes de usar /admin.
-- A autorização não depende de user_metadata editável pelo cliente.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;
drop policy if exists admin_users_select_own on public.admin_users;
create policy admin_users_select_own on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

-- Permite que administradores leiam assinaturas no painel.
-- Manter a política existente de leitura das próprias assinaturas.
drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select on public.subscriptions
for select to authenticated using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);
-- Para conceder acesso, use o UUID de auth.users no SQL Editor (NUNCA no navegador):
-- insert into public.admin_users(user_id) values ('UUID-DO-ADMIN') on conflict do nothing;
