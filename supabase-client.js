import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
const SUPABASE_URL = "https://gkvbxrqhqrvmdfcokivp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2ywtmqyUdokEJREYvvhfyg_50VrN84b";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}
export async function saveProfile(userId, fullName, whatsapp) {
  return supabase.from("profiles").upsert({
    user_id: userId,
    full_name: fullName.trim(),
    whatsapp: whatsapp.trim(),
    updated_at: new Date().toISOString(),
  });
}
export function showBrewing(message = "Preparando sua experiência...") {
  const o = document.querySelector("#brewing-loader");
  if (!o) return;
  o.querySelector("[data-loading-message]").textContent = message;
  o.hidden = false;
  requestAnimationFrame(() => o.classList.add("visible"));
}
export function hideBrewing() {
  const o = document.querySelector("#brewing-loader");
  if (!o) return;
  o.classList.remove("visible");
  setTimeout(() => (o.hidden = true), 260);
}
