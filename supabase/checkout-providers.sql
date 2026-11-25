-- Provider state is server-managed; clients cannot insert or update these rows.
create table if not exists public.shipping_quotes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check(plan in ('Essencial Amazônico','Experiência Amazônica')),
 destination_cep text not null check(destination_cep ~ '^[0-9]{8}$'),
 service_id integer not null,
 service_name text not null,
 carrier_name text not null,
 shipping_cents integer not null check(shipping_cents>=0),
 delivery_days integer check(delivery_days>=0),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '30 minutes')
);
create index if not exists shipping_quotes_by_user on public.shipping_quotes(user_id,created_at desc);
alter table public.shipping_quotes enable row level security;
revoke all on public.shipping_quotes from public,anon,authenticated;
grant select on public.shipping_quotes to authenticated;
drop policy if exists shipping_quotes_read_own on public.shipping_quotes;
create policy shipping_quotes_read_own on public.shipping_quotes for select to authenticated
using(user_id=(select auth.uid()));

create table if not exists public.asaas_customers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text not null unique,
 created_at timestamptz not null default now()
);
alter table public.asaas_customers enable row level security;
revoke all on public.asaas_customers from public,anon,authenticated;

create table if not exists public.asaas_charges (
 subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 charge_id text not null unique,
 invoice_url text not null,
 amount_cents integer not null check(amount_cents>0),
 quote_id uuid references public.shipping_quotes(id),
 created_at timestamptz not null default now()
);
alter table public.asaas_charges enable row level security;
revoke all on public.asaas_charges from public,anon,authenticated;
grant select on public.asaas_charges to authenticated;
drop policy if exists asaas_charges_read_own on public.asaas_charges;
create policy asaas_charges_read_own on public.asaas_charges for select to authenticated
using(user_id=(select auth.uid()));
