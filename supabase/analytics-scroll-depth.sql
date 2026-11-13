-- Scroll milestones with opt-in. No text fields, URLs with query strings, IPs or customer identifiers.
create table if not exists public.analytics_scroll_depth (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  page text not null check (page in ('/','/index.html','/assinatura.html')),
  device text not null check (device in ('celular','tablet','computador')),
  depth_percent integer not null check (depth_percent in (25,50,75,100)),
  created_at timestamptz not null default now()
);
create index if not exists analytics_scroll_depth_page_time_idx on public.analytics_scroll_depth(page,created_at desc);
alter table public.analytics_scroll_depth enable row level security;
revoke all on public.analytics_scroll_depth from public,anon,authenticated;
grant insert(session_id,page,device,depth_percent) on public.analytics_scroll_depth to anon,authenticated;
grant select on public.analytics_scroll_depth to authenticated;
drop policy if exists analytics_scroll_depth_insert on public.analytics_scroll_depth;
create policy analytics_scroll_depth_insert on public.analytics_scroll_depth
for insert to anon,authenticated with check (
  created_at between now()-interval '1 minute' and now()+interval '1 minute'
);
drop policy if exists analytics_scroll_depth_admin_read on public.analytics_scroll_depth;
create policy analytics_scroll_depth_admin_read on public.analytics_scroll_depth
for select to authenticated using (
 exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()))
);
