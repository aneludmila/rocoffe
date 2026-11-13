import { supabase } from "../supabase-client.js";
const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);
const money = (n) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
const gate = (message, {login=false, switchAccount=false, email=""}={}) => {
  $("gate-message").textContent=message;
  $("login-link").hidden=!login;
  $("switch-account").hidden=!switchAccount;
  $("account-email").hidden=!email;
  $("account-email").textContent=email ? `Conta conectada: ${email}` : "";
};
$("switch-account").addEventListener("click",async()=>{
  const button=$("switch-account");
  button.disabled=true;
  $("switch-error").hidden=true;
  const {error}=await supabase.auth.signOut();
  if(error){
    $("switch-error").textContent="Não foi possível sair desta conta. Tente novamente.";
    $("switch-error").hidden=false;
    button.disabled=false;
    return;
  }
  location.replace("../login.html?next=admin%2F");
});
const {data:{user},error:authError} = await supabase.auth.getUser();
if(authError || !user){gate("Entre com sua conta administrativa para continuar.",{login:true});}
else {
  const {data:access,error:accessError}=await supabase.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(accessError){ gate("Não foi possível verificar o acesso administrativo. Confira a conexão e as permissões no Supabase.",{switchAccount:true,email:user.email||""}); }
  else if(!access){ gate("Esta conta não possui autorização para acessar o painel. Entre com a conta oficial da RoCoffee.",{switchAccount:true,email:user.email||""}); }
  else {
    $("gate").hidden=true;$("app").hidden=false;
    await loadDashboard();
  }
}
$("logout").addEventListener("click",async()=>{await supabase.auth.signOut();location.replace("../login.html?next=admin%2F")});
const titles={overview:"Visão geral",audience:"Público e acessos",interests:"Buscas e interesses",heatmaps:"Mapas de calor",recordings:"Gravações",conversions:"Conversões"};
document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll("[data-view]").forEach(x=>x.hidden=x.dataset.view!==btn.dataset.page);
  $("page-title").textContent=titles[btn.dataset.page];
}));
function renderCounts(target,entries){
  const el=$(target);el.replaceChildren();
  if(!entries.length){el.textContent="Nenhum registro encontrado.";return;}
  entries.forEach(([name,num])=>{
    const div=document.createElement("div");div.className="row";
    const label=document.createElement("span");label.textContent=name;
    const count=document.createElement("strong");count.textContent=fmt(num);
    div.append(label,count);el.append(div);
  });
}
async function loadDashboard(){
  $("status").textContent="Carregando assinaturas…";
  const {data,error}=await supabase.from("subscriptions").select("id,plan,status,price_cents");
  if(error){$("status").textContent="Não foi possível carregar as assinaturas. Verifique as políticas de leitura no Supabase.";return;}
  const rows=data??[];
  $("total").textContent=fmt(rows.length);
  $("active").textContent=fmt(rows.filter(x=>x.status==="active").length);
  $("pending").textContent=fmt(rows.filter(x=>x.status==="pending_payment").length);
  $("revenue").textContent=money(rows.filter(x=>x.status==="active").reduce((sum,x)=>sum+(Number(x.price_cents)||0),0)/100);
  const counts=(key)=>Object.entries(rows.reduce((a,x)=>{const k=x[key]||"Não informado";a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]);
  renderCounts("plans",counts("plan"));renderCounts("statuses",counts("status"));
  $("status").textContent="Dados de assinaturas carregados. Demais módulos aguardam instrumentação.";
}
