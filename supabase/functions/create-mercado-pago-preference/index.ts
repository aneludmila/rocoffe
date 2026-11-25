import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const cors = {
  "Access-Control-Allow-Origin": "https://rocoffee.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: cors });

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!accessToken) {
    return new Response(JSON.stringify({ code: "setup_required", error: "A credencial de teste do Mercado Pago ainda não foi configurada." }), { status: 503, headers: cors });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: cors });

  const { subscription_id } = await req.json();
  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("id, plan, frequency, grind")
    .eq("id", subscription_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !subscription) return new Response(JSON.stringify({ error: "Assinatura não encontrada" }), { status: 404, headers: cors });

  const price = subscription.plan === "Experiência Amazônica" ? 279 : 149;
  const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": subscription.id },
    body: JSON.stringify({
      items: [{ id: subscription.id, title: `RoCoffee — ${subscription.plan}`, description: `${subscription.frequency} • ${subscription.grind}`, quantity: 1, currency_id: "BRL", unit_price: price }],
      payer: { email: user.email },
      external_reference: subscription.id,
      back_urls: {
        success: "https://rocoffee.netlify.app/pagamento-retorno.html?resultado=sucesso",
        pending: "https://rocoffee.netlify.app/pagamento-retorno.html?resultado=pendente",
        failure: "https://rocoffee.netlify.app/pagamento-retorno.html?resultado=falha",
      },
      auto_return: "approved",
      statement_descriptor: "ROCOFFEE",
    }),
  });
  const preference = await preferenceResponse.json();
  if (!preferenceResponse.ok) return new Response(JSON.stringify({ error: "Não foi possível iniciar o pagamento", details: preference.message }), { status: 502, headers: cors });

  const privileged = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {error:saveError}=await privileged.from("subscriptions").update({
    price_cents: price * 100,
    payment_provider: "mercado_pago",
    preference_id: preference.id,
    status: "pending_payment",
    updated_at: new Date().toISOString(),
  }).eq("id", subscription.id).eq("user_id",user.id);
  if(saveError)return new Response(JSON.stringify({error:"Falha ao preparar a assinatura"}),{status:502,headers:cors});

  return new Response(JSON.stringify({ checkout_url: preference.sandbox_init_point || preference.init_point }), { headers: cors });
});
