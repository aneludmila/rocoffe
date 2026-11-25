import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"Método não permitido"},405);
 const expected=Deno.env.get("ASAAS_WEBHOOK_TOKEN");
 if(!expected||expected.length<32)return reply({error:"Webhook não configurado"},503);
 const supplied=req.headers.get("asaas-access-token")||"";
 if(supplied!==expected)return reply({error:"Token inválido"},401);
 let event:any;
 try{event=await req.json();}catch{return reply({error:"JSON inválido"},400);}
 const type=String(event?.event||"");
 const payment=event?.payment;
 if(!payment||typeof payment.id!=="string")return reply({ignored:true});
 const paid=type==="PAYMENT_RECEIVED"||type==="PAYMENT_CONFIRMED";
 const reversed=type==="PAYMENT_REFUNDED"||type==="PAYMENT_CHARGEBACK_REQUESTED";
 if(!paid&&!reversed)return reply({ignored:true});
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:charge,error:lookupError}=await admin.from("asaas_charges").select("subscription_id,amount_cents").eq("charge_id",payment.id).maybeSingle();
 if(lookupError)return reply({error:"Erro ao consultar cobrança"},500);
 if(!charge)return reply({ignored:true});
 if(payment.externalReference&&payment.externalReference!==charge.subscription_id)return reply({error:"Referência divergente"},409);
 const reported=Math.round(Number(payment.value)*100);
 if(!Number.isSafeInteger(reported)||reported!==charge.amount_cents)return reply({error:"Valor da cobrança divergente"},409);
 const update:Record<string,unknown>={
   status:paid?"active":"payment_failed",
   payment_id:payment.id,updated_at:new Date().toISOString()
 };
 if(paid)update.paid_at=String(payment.paymentDate||payment.confirmedDate||new Date().toISOString());
 const {error}=await admin.from("subscriptions").update(update)
   .eq("id",charge.subscription_id).eq("payment_provider","asaas");
 if(error)return reply({error:"Falha ao atualizar pagamento"},500);
 return reply({received:true});
});
