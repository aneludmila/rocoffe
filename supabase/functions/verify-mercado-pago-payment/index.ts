import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const cors = {
  "Access-Control-Allow-Origin":
    "https://tangerine-bombolone-ea30da.netlify.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!accessToken)
    return new Response(JSON.stringify({ code: "setup_required" }), {
      status: 503,
      headers: cors,
    });

  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: cors,
    });

  const { payment_id } = await req.json();
  const paymentResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payment = await paymentResponse.json();
  if (!paymentResponse.ok || !payment.external_reference)
    return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), {
      status: 404,
      headers: cors,
    });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", payment.external_reference)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!subscription)
    return new Response(
      JSON.stringify({ error: "Pagamento não pertence a esta conta" }),
      { status: 403, headers: cors },
    );

  const status =
    payment.status === "approved"
      ? "active"
      : payment.status === "rejected"
        ? "payment_failed"
        : "pending_payment";
  await supabase
    .from("subscriptions")
    .update({
      payment_id: String(payment.id),
      status,
      paid_at: payment.status === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);
  return new Response(JSON.stringify({ status }), { headers: cors });
});
