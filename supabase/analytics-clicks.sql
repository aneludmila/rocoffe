-- Agregações de clique, sem identificação do visitante e sem texto digitado.
create table if not exists public.analytics_clicks (
  id bigint generated always as identity primary key,
  page text not null check (page in ('/','/index.html','/assinatura.html')),
  device text not null check (device in ('celular','tablet','computador')),
  viewport_width integer not null check (viewport_width between 280 and 4000),
  x_percent integer not null check (x_percent between 0 and 100),
  y_bucket integer not null check (y_bucket between 0 and 20000 and y_bucket % 50 = 0),
  created_at timestamptz not null default now()
);
create index if not exists analytics_clicks_page_time_idx on public.analytics_clicks(page,created_at desc);
alter table public.analytics_clicks enable row level security;
revoke all on public.analytics_clicks from PUBLIC,anon,authenticated;
grant insert(page,device,viewport_width,x_percent,y_bucket) on public.analytics_clicks to anon,authenticated;
grant select on public.analytics_clicks to authenticated;
drop policy if exists analytics_clicks_insert on public.analytics_clicks;
create policy analytics_clicks_insert on public.analytics_clicks for insert to anon,authenticated
with check (created_at between now()-interval '1 minute' and now()+interval '1 minute');
drop policy if exists analytics_clicks_admin_select on public.analytics_clicks;
create policy analytics_clicks_admin_select on public.analytics_clicks for select to authenticated
using (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid())));
