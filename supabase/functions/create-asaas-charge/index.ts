import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const origins=new Set(["https://rocoffee.netlify.app","https://rocoffee.com.br","https://www.rocoffee.com.br","https://deploy-preview-21--rocoffee.netlify.app"]);
function cors(req:Request){
 const o=req.headers.get("origin")||"";
 return {"Access-Control-Allow-Origin":origins.has(o)?o:"https://rocoffee.netlify.app",
 "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"};
}
const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)});
const plans:Record<string,number>={"Essencial Amazônico":14900,"Experiência Amazônica":27900};
const cep=(v:unknown)=>String(v||"").replace(/\D/g,"");
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return reply(req,{error:"Método não permitido"},405);
 if(req.headers.get("origin")&&!origins.has(req.headers.get("origin")!))return reply(req,{error:"Origem não permitida"},403);
 const key=Deno.env.get("ASAAS_API_KEY"),env=Deno.env.get("ASAAS_ENV");
 if(Deno.env.get("ASAAS_ENABLED")!=="true"||!key||!["sandbox","production"].includes(env||""))
  return reply(req,{code:"setup_required",error:"Pagamento Asaas ainda não habilitado."},503);
 if(req.headers.get("origin")==="https://deploy-preview-21--rocoffee.netlify.app")return reply(req,{code:"preview_payment_disabled",error:"Pagamento desabilitado neste preview enquanto o ambiente de testes não estiver isolado."},403);
 const base=env==="production"?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
 const auth=req.headers.get("authorization")||"";
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await sb.auth.getUser();
 if(userError||!user?.email)return reply(req,{error:"Entre com sua conta para continuar."},401);
 let input:any;try{input=await req.json();}catch{return reply(req,{error:"Solicitação inválida"},400);}
 if(typeof input.subscription_id!=="string"||typeof input.quote_id!=="string")return reply(req,{error:"Identificadores obrigatórios"},400);
 const {data:sub,error:subError}=await sb.from("subscriptions").select("id,user_id,plan,status,payment_provider,preference_id").eq("id",input.subscription_id).eq("user_id",user.id).maybeSingle();
 if(subError||!sub||!(sub.plan in plans))return reply(req,{error:"Assinatura não encontrada"},404);
 if(sub.status==="active"||sub.payment_provider==="mercado_pago"&&sub.preference_id)return reply(req,{error:"Essa assinatura já possui um pagamento iniciado. Confira sua conta."},409);
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:existing}=await admin.from("asaas_charges").select("invoice_url,charge_id").eq("subscription_id",sub.id).maybeSingle();
 if(existing)return reply(req,{checkout_url:existing.invoice_url,reused:true});
 const {data:quote}=await admin.from("shipping_quotes").select("*").eq("id",input.quote_id).eq("user_id",user.id).eq("plan",sub.plan).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(!quote)return reply(req,{error:"Cotação de frete inválida ou expirada. Calcule novamente."},409);
 const {data:addresses}=await sb.from("addresses").select("cep").eq("user_id",user.id);
 if(!(addresses||[]).some((a:any)=>cep(a.cep)===quote.destination_cep))
  return reply(req,{error:"O CEP da cotação não corresponde a um endereço salvo."},409);
 // Prevent a client-edited price or status from being mistaken for an authorization.
 // Subscription status is never trusted as proof of payment: the webhook is authoritative.
 const price=plans[sub.plan]+Number(quote.shipping_cents);
 if(!Number.isSafeInteger(price)||price<500)return reply(req,{error:"Valor do pedido inválido"},400);
 const headers={"access_token":key,"Content-Type":"application/json","Accept":"application/json","User-Agent":"RoCoffee (rocoffe01@gmail.com)"};
 async function asaas(path:string,init:RequestInit={}) {
   const resp=await fetch(base+path,{...init,headers:{...headers,...init.headers}});
   const raw=await resp.text();let parsed:any;
   try{parsed=JSON.parse(raw);}catch{parsed={};}
   if(!resp.ok)throw new Error("Asaas "+resp.status);
   return parsed;
 }
 try {
   let {data:customer}=await admin.from("asaas_customers").select("customer_id").eq("user_id",user.id).maybeSingle();
   if(!customer){
     const {data:profile}=await sb.from("profiles").select("full_name").eq("user_id",user.id).maybeSingle();
     const fullName=String(profile?.full_name||user.user_metadata?.full_name||"").trim();
     if(fullName.length<3)return reply(req,{error:"Complete seu nome no cadastro antes de pagar."},422);
     const created=await asaas("/customers",{method:"POST",body:JSON.stringify({name:fullName,email:user.email,externalReference:user.id,notificationDisabled:true})});
     if(!created.id)throw new Error("Asaas customer missing");
     const {error:customerErr}=await admin.from("asaas_customers").insert({user_id:user.id,customer_id:created.id});
     if(customerErr)throw customerErr;
     customer={customer_id:created.id};
   }
   const dueDate=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
   const charge=await asaas("/payments",{method:"POST",body:JSON.stringify({
     customer:customer.customer_id,billingType:"UNDEFINED",value:price/100,dueDate,
     description:"RoCoffee — "+sub.plan+" (edição + frete)",
     externalReference:sub.id
   })});
   if(typeof charge.id!=="string"||typeof charge.invoiceUrl!=="string"||!charge.invoiceUrl.startsWith("https://"))throw new Error("Asaas charge incomplete");
   const {error:saveError}=await admin.from("asaas_charges").insert({
     subscription_id:sub.id,user_id:user.id,charge_id:charge.id,invoice_url:charge.invoiceUrl,
     amount_cents:price,quote_id:quote.id
   });
   if(saveError)throw saveError;
   const {error:updateError}=await admin.from("subscriptions").update({
     payment_provider:"asaas",preference_id:charge.id,price_cents:price,status:"pending_payment",updated_at:new Date().toISOString()
   }).eq("id",sub.id).eq("user_id",user.id);
   if(updateError)throw updateError;
   return reply(req,{checkout_url:charge.invoiceUrl});
 } catch(e){
   console.error("Asaas create failed:",e instanceof Error?e.message:"unknown");
   return reply(req,{error:"Não foi possível preparar o pagamento. Nenhuma nova tentativa deve ser iniciada antes de conferir sua conta."},502);
 }
});
