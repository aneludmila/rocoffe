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
    await Promise.all([loadDashboard(),loadVisits()]);
  }
}
$("logout").addEventListener("click",async()=>{await supabase.auth.signOut();location.replace("../login.html?next=admin%2F")});
const titles={overview:"Visão geral",audience:"Público e acessos",interests:"Buscas e interesses",heatmaps:"Mapas de calor",recordings:"Gravações",conversions:"Conversões"};
document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll("[data-view]").forEach(x=>x.hidden=x.dataset.view!==btn.dataset.page);
  $("page-title").textContent=titles[btn.dataset.page];
  if(btn.dataset.page==="heatmaps")void loadHeatmap();
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

async function loadVisits(){
  const after=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const {data,error}=await supabase.from("analytics_visits").select("session_id,page,source,medium,device,created_at").gte("created_at",after).order("created_at",{ascending:false}).limit(2000);
  if(error){$("visits-note").textContent="Não foi possível carregar visitas. Verifique a configuração da tabela analytics_visits.";return;}
  const rows=data??[];
  $("views-count").textContent=fmt(rows.length);
  $("sessions-count").textContent=fmt(new Set(rows.map(x=>x.session_id)).size);
  $("pages-count").textContent=fmt(new Set(rows.map(x=>x.page)).size);
  const count=(fn)=>Object.entries(rows.reduce((obj,row)=>{const key=fn(row)||"Não informado";obj[key]=(obj[key]||0)+1;return obj;},{})).sort((a,b)=>b[1]-a[1]);
  renderCounts("visit-sources",count(x=>x.source));
  renderCounts("visit-devices",count(x=>x.device));
  renderCounts("visit-pages",count(x=>x.page));
  const hours=count(x=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Porto_Velho",hour:"2-digit",hourCycle:"h23"}).format(new Date(x.created_at))+"h").sort((a,b)=>Number(a[0].slice(0,2))-Number(b[0].slice(0,2)));
  renderCounts("visit-hours",hours);
  $("visits-note").textContent="Últimos 30 dias · apenas visitas com consentimento · "+(rows.length===2000?"limite de 2.000 eventos nesta versão; números podem estar incompletos.":"sem idade e gênero.");
}

let heatmapData=[];
let heatLoaded=false;
const HEAT_WIDTHS={computador:1200,celular:390,tablet:768};
async function loadHeatmap(){
  if(!heatLoaded){
    heatLoaded=true;
    $("heat-page").addEventListener("change",drawHeatmap);
    $("heat-device").addEventListener("change",drawHeatmap);
    $("heat-refresh").addEventListener("click",()=>{heatLoaded=false;void loadHeatmap();});
  }
  $("heat-status").textContent="Carregando cliques consentidos…";
  const after=new Date(Date.now()-30*86400000).toISOString();
  const {data,error}=await supabase.from("analytics_clicks")
    .select("page,device,viewport_width,x_percent,y_bucket,created_at")
    .gte("created_at",after).order("created_at",{ascending:false}).limit(2000);
  if(error){
    $("heat-status").textContent="Não foi possível buscar cliques. Verifique a tabela analytics_clicks no Supabase.";
    return;
  }
  heatmapData=data??[];
  drawHeatmap();
}
function drawHeatmap(){
  const page=$("heat-page").value,device=$("heat-device").value;
  const width=HEAT_WIDTHS[device];
  const stage=$("heat-stage"),frame=$("heat-frame"),layer=$("heat-layer"),wrap=$("heat-frame-wrap");
  const rows=heatmapData.filter(r=>(r.page===page||(page==="/index.html"&&r.page==="/"))&&r.device===device);
  const height=page==="/assinatura.html"?4200:3300;
  const scale=Math.min(1,Math.max(0.1,(wrap.clientWidth-2)/width));
  stage.style.width=width+"px";stage.style.height=height+"px";
  stage.style.transform="scale("+scale+")";
  wrap.style.height=Math.ceil(height*scale)+"px";
  frame.style.width=width+"px";frame.style.height=height+"px";
  layer.replaceChildren();
  const preview=page.slice(1);
  if(frame.getAttribute("src")!=="../"+preview)frame.setAttribute("src","../"+preview);
  // Agrupar pontos na mesma região para tornar as áreas populares visualmente mais intensas.
  const bins=new Map();
  for(const r of rows){
    const y=Math.min(height-1,Math.max(0,Number(r.y_bucket)||0));
    const key=r.x_percent+":"+y;
    bins.set(key,(bins.get(key)||0)+1);
  }
  const top=Math.max(1,...bins.values());
  for(const [key,count] of bins){
    const [x,y]=key.split(":").map(Number);
    const dot=document.createElement("div");
    dot.className="heat-dot";
    dot.style.left=(x/100*width)+"px";
    dot.style.top=y+"px";
    dot.style.opacity=String(Math.min(1,0.22+0.78*(count/top)));
    layer.append(dot);
  }
  $("heat-status").textContent=rows.length+" clique(s) encontrados para esta página e dispositivo"+(heatmapData.length===2000?" (amostra limitada aos 2.000 eventos mais recentes).":".");
}
window.addEventListener("resize",()=>{
  if(!document.querySelector('[data-view="heatmaps"]').hidden && heatLoaded)drawHeatmap();
});
