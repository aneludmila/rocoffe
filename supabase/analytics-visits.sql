-- Eventos simples de visita com consentimento; sem IP, nome, e-mail ou URL com query strings.
create table if not exists public.analytics_visits (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  page text not null check (char_length(page) between 1 and 80 and page ~ '^/[a-zA-Z0-9/_-]*$'),
  source text not null check (char_length(source) between 1 and 70),
  medium text not null check (char_length(medium) between 1 and 40),
  device text not null check (device in ('celular','tablet','computador')),
  created_at timestamptz not null default now()
);
create index if not exists analytics_visits_created_at_idx on public.analytics_visits(created_at desc);
create index if not exists analytics_visits_session_idx on public.analytics_visits(session_id);
alter table public.analytics_visits enable row level security;
revoke all on public.analytics_visits from PUBLIC, anon, authenticated;
grant insert (session_id, page, source, medium, device) on public.analytics_visits to anon, authenticated;
grant select on public.analytics_visits to authenticated;
drop policy if exists analytics_visits_insert on public.analytics_visits;
create policy analytics_visits_insert on public.analytics_visits
for insert to anon, authenticated with check (
  created_at <= now() + interval '1 minute'
  and created_at >= now() - interval '1 minute'
);
drop policy if exists analytics_visits_admin_read on public.analytics_visits;
create policy analytics_visits_admin_read on public.analytics_visits
for select to authenticated using (
 exists(select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
-- Limpeza periódica deve ser configurada após definição do prazo de retenção.
