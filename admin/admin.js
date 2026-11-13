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
let previewReady=false;
let previewPage="";
let previewWidth=0;
let previewHeight=0;
const HEAT_WIDTHS={computador:1200,celular:390,tablet:768};
const heatFrame=$("heat-frame");
const heatCanvas=$("heat-canvas");
function currentHeatPage(){return $("heat-page").value;}
function currentHeatWidth(){return HEAT_WIDTHS[$("heat-device").value];}
function sizeHeatPreview(){
  const doc=heatFrame.contentDocument;
  if(!doc?.body)return false;
  // Preview is sandboxed without allow-scripts; the normal video loader never dismisses itself.
  // Remove that preview-only overlay without changing the production storefront.
  doc.querySelector("#brewing-loader")?.remove();
  doc.querySelector("#account-loader")?.remove();
  const css=doc.getElementById("rc-preview-cleanup")||doc.createElement("style");
  css.id="rc-preview-cleanup";
  css.textContent=`#brewing-loader,.loader,.rocoffee-ios-gif,.brewing-video,#rc-privacy,#rc-privacy-link{display:none!important}html,body{overflow:visible!important}html{scroll-behavior:auto!important}*{animation-duration:0s!important;transition-duration:0s!important}`;
  if(!css.isConnected)doc.head.append(css);
  doc.querySelectorAll("video").forEach(v=>{v.pause();v.removeAttribute("autoplay");});
  const width=currentHeatWidth();
  // Reset the iframe height before measuring so scrollHeight does not inherit a prior tall viewport.
  heatFrame.style.height="800px";
  const body=doc.body,root=doc.documentElement;
  const height=Math.max(800,body.scrollHeight,body.offsetHeight,root.scrollHeight,root.offsetHeight);
  previewHeight=Math.min(16000,height);
  previewWidth=width;
  heatFrame.style.width=width+"px";
  heatFrame.style.height=previewHeight+"px";
  const stage=$("heat-stage");
  stage.style.width=width+"px";stage.style.height=previewHeight+"px";
  heatCanvas.style.width=width+"px";
  heatCanvas.style.height=previewHeight+"px";
  const scale=Math.min(1,Math.max(0.05,($("heat-frame-wrap").clientWidth-2)/width));
  stage.style.transform=`scale(${scale})`;
  $("heat-frame-wrap").style.height=Math.ceil(previewHeight*scale)+"px";
  previewReady=true;
  return true;
}
function setHeatPreview(){
  const page=currentHeatPage(),width=currentHeatWidth();
  const source=page==="/assinatura.html"?"../assinatura.html":"../index.html";
  previewReady=false;
  heatFrame.style.width=width+"px";
  heatFrame.style.height="800px";
  const stage=$("heat-stage");
  stage.style.width=width+"px";
  stage.style.height="800px";
  const url=source+"?heat_preview="+width;
  if(heatFrame.getAttribute("src")!==url)heatFrame.setAttribute("src",url);
  else {sizeHeatPreview();renderHeat();}
}
heatFrame.addEventListener("load",()=>{
  try {
    if(!sizeHeatPreview())throw new Error("Página sem conteúdo");
    // Font loading can change page height; measure once after fonts settle.
    heatFrame.contentDocument?.fonts?.ready?.then(()=>{
      if(sizeHeatPreview())renderHeat();
    }).catch(()=>{});
    renderHeat();
  } catch(e){
    $("heat-status").textContent="Não foi possível preparar a prévia da página. Atualize o painel.";
  }
});
async function loadHeatmap(){
  if(!heatLoaded){
    heatLoaded=true;
    $("heat-page").addEventListener("change",()=>{setHeatPreview();renderHeat();});
    $("heat-device").addEventListener("change",()=>{setHeatPreview();renderHeat();});
    $("heat-period").addEventListener("change",()=>void fetchHeatData());
    $("heat-refresh").addEventListener("click",()=>void fetchHeatData());
  }
  setHeatPreview();
  await fetchHeatData();
}
async function fetchHeatData(){
  $("heat-status").textContent="Carregando dados reais de cliques...";
  const days=Number($("heat-period").value)||30;
  const after=new Date(Date.now()-days*86400000).toISOString();
  const {data,error}=await supabase.from("analytics_clicks")
    .select("page,device,viewport_width,x_percent,y_bucket,y_ratio,created_at")
    .gte("created_at",after).order("created_at",{ascending:false}).limit(2000);
  if(error){
    $("heat-status").textContent="Não foi possível carregar os cliques. Confira a tabela analytics_clicks.";
    return;
  }
  heatmapData=data||[];
  renderHeat();
}
function getClickPosition(row,width,height){
  const x=Math.max(0,Math.min(width,Number(row.x_percent)/100*width));
  let y;
  if(row.y_ratio!==null && row.y_ratio!==undefined){
    y=Number(row.y_ratio)*height;
  }else{
    // Backward compatibility with pre-migration click records.
    const recordedWidth=Number(row.viewport_width)||width;
    y=(Number(row.y_bucket)||0)*(width/recordedWidth);
  }
  return [x,Math.max(0,Math.min(height-1,y))];
}
function renderHeat(){
  const page=currentHeatPage(),device=$("heat-device").value;
  const records=heatmapData.filter(r=>(r.page===page||(page==="/index.html"&&r.page==="/"))&&r.device===device);
  const width=previewWidth||currentHeatWidth(),height=previewHeight||3300;
  const ctx=heatCanvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return;
  // Half resolution improves performance on long pages while preserving visually smooth heat.
  const density=0.5;
  const cw=Math.ceil(width*density),ch=Math.ceil(height*density);
  heatCanvas.width=cw;heatCanvas.height=ch;
  ctx.clearRect(0,0,cw,ch);
  if(!records.length){
    $("heat-status").textContent="Nenhum clique consentido encontrado para esta página, dispositivo e período.";
    return;
  }
  const bins=new Map();
  for(const record of records){
    const [x,y]=getClickPosition(record,width,height);
    const key=Math.round(x/20)+":"+Math.round(y/25);
    bins.set(key,(bins.get(key)||0)+1);
  }
  const max=Math.max(...bins.values(),1);
  for(const [key,count] of bins){
    const [gx,gy]=key.split(":").map(Number);
    const x=gx*20*density,y=gy*25*density;
    const radius=(device==="celular"?65:90)*density;
    const weight=Math.sqrt(count/max);
    const gradient=ctx.createRadialGradient(x,y,0,x,y,radius);
    gradient.addColorStop(0,"rgba(255,255,255,"+(0.36+0.57*weight)+")");
    gradient.addColorStop(0.4,"rgba(255,255,255,"+(0.23+0.40*weight)+")");
    gradient.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=gradient;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
  }
  const img=ctx.getImageData(0,0,cw,ch),p=img.data;
  for(let i=0;i<p.length;i+=4){
    const a=p[i+3]/255;
    if(a<0.03){p[i+3]=0;continue;}
    // Low activity blue/cyan; medium yellow; hotspots orange/red.
    const stops=[[50,95,255],[49,190,238],[100,209,135],[255,225,48],[255,139,29],[239,35,40]];
    const scaled=Math.min(0.999,Math.pow(a,0.7))*5;
    const n=Math.floor(scaled),t=scaled-n;
    for(let c=0;c<3;c++)p[i+c]=Math.round(stops[n][c]*(1-t)+stops[n+1][c]*t);
    p[i+3]=Math.round(Math.min(0.76,a*0.78)*255);
  }
  ctx.putImageData(img,0,0);
  $("heat-status").textContent=records.length+" clique(s) nesta visualização. Cores mais quentes indicam regiões com mais interações"+(heatmapData.length===2000?" (amostra limitada aos últimos 2.000 eventos).":".");
}
window.addEventListener("resize",()=>{if(previewReady&&document.querySelector('[data-view="heatmaps"]')?.hidden===false){sizeHeatPreview();renderHeat();}});
