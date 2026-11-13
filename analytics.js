// RoCoffee Analytics: eventos de página somente após opt-in explícito.
import { supabase } from "./supabase-client.js";
const STORAGE_KEY="rocoffee_analytics_consent_v3";

const style=document.createElement("style");
style.textContent=`#rc-privacy{position:fixed;z-index:10001;left:16px;right:16px;bottom:16px;max-width:570px;background:#fffaf3;border:1px solid #d7c7b3;box-shadow:0 15px 55px #0003;color:#30221b;padding:20px;border-radius:12px;font:14px/1.55 Arial,sans-serif}#rc-privacy[hidden]{display:none!important}#rc-privacy p{margin:8px 0 16px}#rc-privacy-actions{display:flex;gap:9px;flex-wrap:wrap}#rc-privacy button,#rc-privacy-link{font:600 13px Arial,sans-serif;padding:10px 13px;border-radius:5px;cursor:pointer}#rc-privacy button{border:1px solid #253015;background:#253015;color:white}#rc-privacy button.secondary{background:transparent;color:#253015}#rc-privacy-link{position:fixed;right:12px;bottom:12px;z-index:10000;background:#fffaf3;border:1px solid #d7c7b3;color:#30221b}`;
document.head.appendChild(style);
const banner=document.createElement("div");
banner.id="rc-privacy";banner.hidden=true;
banner.setAttribute("role","dialog");banner.setAttribute("aria-label","Preferências de privacidade");
banner.innerHTML=`<strong>Privacidade na RoCoffee ☕</strong><p>Com sua permissão, registramos páginas visitadas, origem da visita, tipo de dispositivo e posições aproximadas dos cliques e profundidade de rolagem nas páginas públicas para melhorar a loja. Os eventos enviados para análise não incluem nome, e-mail, conteúdo digitado ou endereço IP. A infraestrutura de hospedagem pode processar dados técnicos de conexão. Você pode mudar sua escolha.</p><div id="rc-privacy-actions"><button type="button" id="rc-accept">Aceitar análise</button><button type="button" class="secondary" id="rc-reject">Recusar</button></div>`;
const manage=document.createElement("button");manage.id="rc-privacy-link";manage.type="button";manage.textContent="Privacidade";
document.body.append(banner,manage);
function safeToken(value,max){return String(value||"").normalize("NFKC").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,max);}
function getAttribution(){
 let item;
 try{item=JSON.parse(sessionStorage.getItem("rc-attribution")||"null");}catch{}
 if(item)return item;
 const params=new URLSearchParams(location.search);
 const utm=safeToken(params.get("utm_source"),70);
 let source=utm||"direto";
 let medium=safeToken(params.get("utm_medium"),40)||"nenhum";
 if(!utm && document.referrer){
   try{const u=new URL(document.referrer);if(u.origin!==location.origin){source=safeToken(u.hostname,70);medium="referencia";}}catch{}
 }
 item={source,medium};sessionStorage.setItem("rc-attribution",JSON.stringify(item));return item;
}
function getDevice(){const ua=navigator.userAgent||"";return /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?"tablet":/Mobi|iPhone|Android/i.test(ua)?"celular":"computador";}
let recorded=false;
async function sendVisit(){
 if(recorded||localStorage.getItem(STORAGE_KEY)!=="accepted"||!navigator.onLine)return;
 recorded=true;
 let sid=sessionStorage.getItem("rc-session-id");
 if(!sid){sid=crypto.randomUUID();sessionStorage.setItem("rc-session-id",sid);}
 const {source,medium}=getAttribution();
 const path=location.pathname.replace(/\/$/,"")||"/";
 const cleanPage=(path==="/"?"/":path).slice(0,80);
 // Não registrar páginas administrativas nem URLs desconhecidas.
 if(!/^\/[a-zA-Z0-9/_.-]*$/.test(cleanPage)||cleanPage.startsWith("/admin"))return;
 try{
 const {error}=await supabase.from("analytics_visits").insert({session_id:sid,page:cleanPage,source,medium,device:getDevice()});
 if(error)console.warn("RoCoffee: métricas temporariamente indisponíveis.");
 }catch{console.warn("RoCoffee: erro de conexão com métricas.");}
}
function choose(value){localStorage.setItem(STORAGE_KEY,value);banner.hidden=true;if(value==="accepted"){void sendVisit();scheduleScroll();}}
banner.querySelector("#rc-accept").addEventListener("click",()=>choose("accepted"));
banner.querySelector("#rc-reject").addEventListener("click",()=>choose("rejected"));
manage.addEventListener("click",()=>{banner.hidden=false;});
const consent=localStorage.getItem(STORAGE_KEY);
if(consent==="accepted")void sendVisit();
else if(consent!=="rejected")banner.hidden=false;

const HEAT_PAGES=new Set(["/","/index.html","/assinatura.html"]);
let lastClickAt=0;
document.addEventListener("click",async(event)=>{
  if(localStorage.getItem(STORAGE_KEY)!=="accepted" || !navigator.onLine || !event.isTrusted)return;
  const page=location.pathname;
  if(!HEAT_PAGES.has(page))return;
  const el=event.target;
  if(!(el instanceof Element))return;
  // Nunca coletar cliques em formulários, campos, dados pessoais, checkouts ou preferências de privacidade.
  if(el.closest('form,input,textarea,select,[contenteditable],label,[data-private],#rc-privacy,#rc-privacy-link,[autocomplete]'))return;
  if(Date.now()-lastClickAt<1500)return; // amostragem simples, no máximo um clique a cada 1,5 s por aba
  lastClickAt=Date.now();
  const width=document.documentElement.clientWidth;
  if(width<280||width>4000)return;
  const x=Math.max(0,Math.min(100,Math.round((event.clientX/width)*20)*5));
  const fullHeight=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight,1);
  const y=Math.max(0,Math.min(20000,Math.round((event.pageY/50))*50));
  const yRatio=Math.max(0,Math.min(1,event.pageY/fullHeight));
  try{
    const {error}=await supabase.from("analytics_clicks").insert({
      page,device:getDevice(),viewport_width:width,x_percent:x,y_bucket:y,y_ratio:yRatio
    });
    if(error)console.warn("RoCoffee: mapa de calor temporariamente indisponível.");
  }catch{console.warn("RoCoffee: não foi possível registrar o clique.");}
},{passive:true});

// Milestones de rolagem: eventos discretos (25/50/75/100%), sem gravar movimentos ou conteúdo.
const SCROLL_PAGES=new Set(["/","/index.html","/assinatura.html"]);
const SCROLL_MARKS=[25,50,75,100];
const scrollSent=new Set();
let scrollTicking=false;
function scrollPage(){
  const page=location.pathname;
  return SCROLL_PAGES.has(page)?(page==="/"?"/index.html":page):null;
}
function scrollConsent(){return localStorage.getItem(STORAGE_KEY)==="accepted";}
function scrollSessionId(){
  let sid=sessionStorage.getItem("rc-session-id");
  if(!sid){sid=crypto.randomUUID();sessionStorage.setItem("rc-session-id",sid);}
  return sid;
}
async function saveScrollMark(page,depth){
  if(!scrollConsent()||!navigator.onLine)return;
  try {
    const {error}=await supabase.from("analytics_scroll_depth").insert({
      session_id:scrollSessionId(),page,device:getDevice(),depth_percent:depth
    });
    if(error)console.warn("RoCoffee: profundidade de rolagem temporariamente indisponível.");
  }catch {console.warn("RoCoffee: erro ao registrar profundidade.");}
}
function measureScroll(){
  scrollTicking=false;
  const page=scrollPage();
  if(!page||!scrollConsent())return;
  const doc=document.documentElement;
  const total=Math.max(doc.scrollHeight,document.body.scrollHeight,1);
  const viewed=Math.min(total,window.scrollY+window.innerHeight);
  const depth=Math.min(100,Math.floor(100*viewed/total));
  const session=scrollSessionId();
  for(const mark of SCROLL_MARKS){
    if(depth<mark)continue;
    const key="rc-scroll-v3:"+session+":"+page+":"+mark;
    if(scrollSent.has(key)||sessionStorage.getItem(key)==="1")continue;
    scrollSent.add(key);
    sessionStorage.setItem(key,"1");
    void saveScrollMark(page,mark);
  }
}
function scheduleScroll(){
  if(!scrollTicking){scrollTicking=true;requestAnimationFrame(measureScroll);}
}
window.addEventListener("scroll",scheduleScroll,{passive:true});
window.addEventListener("resize",scheduleScroll,{passive:true});
window.addEventListener("load",scheduleScroll,{once:true});
if(document.readyState==="complete")scheduleScroll();
