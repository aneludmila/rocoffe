import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const origins=new Set(["https://rocoffee.netlify.app","https://rocoffee.com.br","https://www.rocoffee.com.br"]);
function headers(req:Request){
 const origin=req.headers.get("origin")||"";
 return {"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://rocoffee.netlify.app",
 "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"};
}
function json(req:Request,payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:headers(req)});}
const planPrices:Record<string,number>={"Essencial Amazônico":149,"Experiência Amazônica":279};
const cepOnly=(v:unknown)=>String(v||"").replace(/\D/g,"");
function dimensions(plan:string){
 const kind=plan==="Experiência Amazônica"?"EXPERIENCIA":"ESSENCIAL";
 const raw=["WIDTH_CM","HEIGHT_CM","LENGTH_CM","WEIGHT_KG"].map(k=>Number(Deno.env.get("ME_"+kind+"_"+k)));
 return raw.every(v=>Number.isFinite(v)&&v>0)?raw:null;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
 if(req.method!=="POST")return json(req,{error:"Método não permitido"},405);
 if(req.headers.get("origin")&&!origins.has(req.headers.get("origin")!))return json(req,{error:"Origem não permitida"},403);
 const token=Deno.env.get("ME_API_TOKEN"),origin=cepOnly(Deno.env.get("ME_ORIGIN_CEP"));
 if(!token||origin.length!==8)return json(req,{code:"setup_required",error:"A cotação de frete ainda não está configurada."},503);
 const auth=req.headers.get("authorization")||"";
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await sb.auth.getUser();
 if(userError||!user)return json(req,{error:"Entre na sua conta para calcular o frete."},401);
 let body:Record<string,unknown>;
 try{body=await req.json();}catch{return json(req,{error:"Dados inválidos."},400);}
 const plan=String(body.plan||""),destination=cepOnly(body.cep);
 if(!(plan in planPrices)||destination.length!==8)return json(req,{error:"Plano ou CEP inválido."},400);
 const size=dimensions(plan);
 if(!size)return json(req,{code:"package_setup_required",error:"As medidas da embalagem ainda precisam ser configuradas."},503);
 const [width,height,length,weight]=size;
 const apiBase=Deno.env.get("ME_ENV")==="production"?"https://melhorenvio.com.br":"https://sandbox.melhorenvio.com.br";
 const res=await fetch(apiBase+"/api/v2/me/shipment/calculate",{
  method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json","User-Agent":"RoCoffee (rocoffe01@gmail.com)"},
  body:JSON.stringify({from:{postal_code:origin},to:{postal_code:destination},
   products:[{id:plan==="Experiência Amazônica"?"experiencia":"essencial",width,height,length,weight,insurance_value:planPrices[plan],quantity:1}],
   options:{receipt:false,own_hand:false}})
 });
 if(!res.ok)return json(req,{error:"Não foi possível consultar as transportadoras.",code:"provider_unavailable"},502);
 const data=await res.json();
 if(!Array.isArray(data))return json(req,{error:"Resposta inesperada das transportadoras."},502);
 const offerings=data.filter((o:any)=>!o.error&&Number.isFinite(Number(o.custom_price??o.price))&&Number(o.custom_price??o.price)>=0)
 .map((o:any)=>({service_id:Number(o.id),service_name:String(o.name||"Serviço"),carrier_name:String(o.company?.name||"Transportadora"),
  shipping_cents:Math.round(Number(o.custom_price??o.price)*100),
  delivery_days:Number.isFinite(Number(o.custom_delivery_time??o.delivery_time))?Number(o.custom_delivery_time??o.delivery_time):null}))
 .filter((o:any)=>Number.isInteger(o.service_id)&&o.service_id>0).sort((a:any,b:any)=>a.shipping_cents-b.shipping_cents).slice(0,8);
 if(!offerings.length)return json(req,{options:[],message:"Nenhuma transportadora disponível para este CEP."});
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const rows=offerings.map((o:any)=>({...o,user_id:user.id,plan,destination_cep:destination}));
 const {data:stored,error}=await admin.from("shipping_quotes").insert(rows).select("id,service_name,carrier_name,shipping_cents,delivery_days,expires_at");
 if(error||!stored)return json(req,{error:"Não foi possível salvar a cotação."},502);
 return json(req,{options:stored});
});
