-- Only the backend (service_role) may change payment fields and subscription state.
revoke all privileges on table public.subscriptions from authenticated, anon;
grant select on table public.subscriptions to authenticated;
grant insert (user_id,plan,frequency,grind) on table public.subscriptions to authenticated;
-- Keep existing RLS ownership policies; column grants prevent client-set payment status,
-- paid_at, payment_provider, payment_id, preference_id, price_cents, and updates.
