-- Applied in the RoCoffee Supabase project.
-- Keep existing y_bucket values for backward-compatible click visualization.
alter table public.analytics_clicks
  add column if not exists y_ratio numeric(7,6)
  check (y_ratio is null or (y_ratio between 0 and 1));
grant insert(y_ratio) on public.analytics_clicks to anon,authenticated;
