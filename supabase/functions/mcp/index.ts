// Eatime360 MCP Server — v0.3.0 (external authorize page)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const HMAC_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! + ":mcp_oauth_v1";
const PUBLIC_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp`;
const AUTHORIZE_PAGE = "https://goudfoud54.github.io/raya-staging/oauth/authorize.html";

async function sha256Hex(s: string): Promise<string> { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hmac(data: string): Promise<string> { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(HMAC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)); return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join(""); }
function b64u(s: string): string { return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function b64uDecode(s: string): string { return atob(s.replace(/-/g,"+").replace(/_/g,"/")); }
async function signPayload(p: any): Promise<string> { const d = b64u(JSON.stringify(p)); return d + "." + (await hmac(d)); }
async function verifyPayload(token: string): Promise<any | null> { const [d, s] = (token||"").split("."); if (!d||!s) return null; if ((await hmac(d)) !== s) return null; try { return JSON.parse(b64uDecode(d)); } catch { return null; } }

function corsHeaders(): Headers { const h = new Headers(); h.set("Access-Control-Allow-Origin", "*"); h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version"); h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS"); h.set("Access-Control-Expose-Headers", "mcp-session-id, www-authenticate"); return h; }
function json(body: any, status = 200, extra: Record<string,string> = {}): Response { const h = corsHeaders(); h.set("Content-Type", "application/json"); for (const [k,v] of Object.entries(extra)) h.set(k, v); return new Response(JSON.stringify(body), { status, headers: h }); }
function jr(id: any, result?: any, error?: any): Response { const b: any = { jsonrpc: "2.0", id }; if (error) b.error = error; else b.result = result; return json(b); }
function jrErr(id: any, code: number, message: string): Response { return jr(id, undefined, { code, message }); }

const TOOLS = [
  { name: "list_salaries", description: "Liste les salariés. Filtres: actif (bool), snack_id.", inputSchema: { type: "object", properties: { actif: { type: "boolean" }, snack_id: { type: "string" } } } },
  { name: "get_salarie", description: "Récupère la fiche complète d'un salarié.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "list_snacks", description: "Liste les snacks/restaurants.", inputSchema: { type: "object" } },
  { name: "get_planning_week", description: "Planning d'un snack pour une semaine.", inputSchema: { type: "object", properties: { snack_id: { type: "string" }, monday_date: { type: "string" } }, required: ["snack_id", "monday_date"] } },
  { name: "list_pointages", description: "Pointages entre date_from et date_to.", inputSchema: { type: "object", properties: { date_from: { type: "string" }, date_to: { type: "string" }, salarie_id: { type: "string" } }, required: ["date_from", "date_to"] } },
  { name: "list_invitations", description: "Invitations de l'org.", inputSchema: { type: "object", properties: { pending_only: { type: "boolean" } } } },
  { name: "list_dispos", description: "Demandes d'indisponibilité.", inputSchema: { type: "object", properties: { salarie_id: { type: "string" }, statut: { type: "string" } } } },
  { name: "get_org_info", description: "Infos org + compteurs.", inputSchema: { type: "object" } },
  { name: "create_salarie", description: "Crée un salarié.", inputSchema: { type: "object", properties: { nom: { type: "string" }, prenom: { type: "string" }, snack_origine_id: { type: "string" }, type_contrat: { type: "string" }, taux_horaire_brut: { type: "number" }, coef_charges_perso: { type: "number" }, date_entree: { type: "string" }, email: { type: "string" }, telephone: { type: "string" }, heures_min: { type: "number" }, heures_max: { type: "number" }, est_multi: { type: "boolean" }, pin_badgeuse: { type: "string" }, couleur: { type: "string" } }, required: ["nom"] } },
  { name: "update_salarie", description: "Met à jour un salarié.", inputSchema: { type: "object", properties: { id: { type: "string" }, patch: { type: "object" } }, required: ["id", "patch"] } },
  { name: "set_planning_cell", description: "Crée/met à jour/supprime un créneau.", inputSchema: { type: "object", properties: { snack_id: { type: "string" }, date: { type: "string" }, service: { type: "string", enum: ["midi", "soir"] }, salarie_id: { type: "string" }, role: { type: "string", enum: ["cuisine", "caisse"] }, heure_debut: { type: "string" }, heure_fin: { type: "string" } }, required: ["snack_id", "date", "service", "salarie_id", "role"] } },
  { name: "create_pointage", description: "Pointage manuel.", inputSchema: { type: "object", properties: { salarie_id: { type: "string" }, restaurant_id: { type: "string" }, ts: { type: "string" }, type: { type: "string", enum: ["entree", "sortie"] } }, required: ["salarie_id", "restaurant_id", "ts", "type"] } },
  { name: "create_invitation", description: "Crée une invitation.", inputSchema: { type: "object", properties: { email: { type: "string" }, role: { type: "string", enum: ["admin", "manager", "salarie"] }, salarie_id: { type: "string" }, base_url: { type: "string" } }, required: ["email", "role"] } },
  { name: "revoke_invitation", description: "Annule une invitation.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "update_org", description: "Met à jour l'organisation.", inputSchema: { type: "object", properties: { patch: { type: "object" } }, required: ["patch"] } },
  { name: "set_dispo_decision", description: "Valide ou refuse une demande.", inputSchema: { type: "object", properties: { id: { type: "string" }, decision: { type: "string", enum: ["validee", "refusee"] } }, required: ["id", "decision"] } },
];

async function runTool(orgId: string, name: string, args: any): Promise<any> {
  switch (name) {
    case "list_salaries": { let q = SB.from("salaries").select("*").eq("organization_id", orgId); if (typeof args?.actif === "boolean") q = q.eq("actif", args.actif); if (args?.snack_id) q = q.eq("snack_origine_id", args.snack_id); const { data, error } = await q.order("nom"); if (error) throw error; return { count: data?.length||0, salaries: data }; }
    case "get_salarie": { const { data, error } = await SB.from("salaries").select("*").eq("organization_id", orgId).eq("id", args.id).maybeSingle(); if (error) throw error; return data; }
    case "list_snacks": { const { data, error } = await SB.from("restaurants").select("*").eq("organization_id", orgId).order("nom"); if (error) throw error; return { count: data?.length||0, snacks: data }; }
    case "get_planning_week": { const monday = args.monday_date; const d = new Date(monday); d.setDate(d.getDate()+6); const sunday = d.toISOString().slice(0,10); const { data, error } = await SB.from("planning_creneaux").select("*").eq("organization_id", orgId).eq("restaurant_id", args.snack_id).gte("date", monday).lte("date", sunday).order("date").order("service"); if (error) throw error; return { week_start: monday, week_end: sunday, count: data?.length||0, creneaux: data }; }
    case "list_pointages": { let q = SB.from("pointages").select("*").eq("organization_id", orgId).gte("ts", args.date_from+"T00:00:00").lte("ts", args.date_to+"T23:59:59"); if (args?.salarie_id) q = q.eq("salarie_id", args.salarie_id); const { data, error } = await q.order("ts"); if (error) throw error; return { count: data?.length||0, pointages: data }; }
    case "list_invitations": { let q = SB.from("invitations").select("*").eq("organization_id", orgId); if (args?.pending_only) q = q.is("accepted_at", null); const { data, error } = await q.order("created_at", { ascending: false }); if (error) throw error; return { count: data?.length||0, invitations: data }; }
    case "list_dispos": { let q = SB.from("salarie_dispos").select("*").eq("organization_id", orgId); if (args?.salarie_id) q = q.eq("salarie_id", args.salarie_id); if (args?.statut) q = q.eq("statut_demande", args.statut); const { data, error } = await q.order("created_at", { ascending: false }); if (error) throw error; return { count: data?.length||0, dispos: data }; }
    case "get_org_info": { const { data: org } = await SB.from("organizations").select("*").eq("id", orgId).maybeSingle(); const { count: nbSal } = await SB.from("salaries").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("actif", true); const { count: nbSnack } = await SB.from("restaurants").select("*", { count: "exact", head: true }).eq("organization_id", orgId); const { count: nbInv } = await SB.from("invitations").select("*", { count: "exact", head: true }).eq("organization_id", orgId).is("accepted_at", null); return { organization: org, salaries_actifs: nbSal, nb_snacks: nbSnack, invitations_pending: nbInv }; }
    case "create_salarie": { const p: any = { ...args, organization_id: orgId, actif: true }; if (!p.pin_badgeuse) p.pin_badgeuse = String(Math.floor(Math.random()*9000)+1000); const { data, error } = await SB.from("salaries").insert(p).select().single(); if (error) throw error; return { ok: true, salarie: data }; }
    case "update_salarie": { const { data, error } = await SB.from("salaries").update(args.patch).eq("organization_id", orgId).eq("id", args.id).select().single(); if (error) throw error; return { ok: true, salarie: data }; }
    case "set_planning_cell": { const hd = args.heure_debut||null, hf = args.heure_fin||null; if (!hd && !hf) { const { error } = await SB.from("planning_creneaux").delete().eq("organization_id", orgId).eq("restaurant_id", args.snack_id).eq("salarie_id", args.salarie_id).eq("date", args.date).eq("service", args.service); if (error) throw error; return { ok: true, action: "deleted" }; } const p = { organization_id: orgId, restaurant_id: args.snack_id, salarie_id: args.salarie_id, date: args.date, service: args.service, role: args.role, heure_debut: hd, heure_fin: hf }; const { data, error } = await SB.from("planning_creneaux").upsert(p, { onConflict: "restaurant_id,salarie_id,date,service" }).select().single(); if (error) throw error; return { ok: true, action: "upserted", creneau: data }; }
    case "create_pointage": { const { data, error } = await SB.from("pointages").insert({ ...args, organization_id: orgId }).select().single(); if (error) throw error; return { ok: true, pointage: data }; }
    case "create_invitation": { const { data, error } = await SB.from("invitations").insert({ organization_id: orgId, email: args.email, role: args.role, salarie_id: args.salarie_id||null }).select().single(); if (error) throw error; const link = args.base_url ? `${args.base_url.replace(/\/$/,"")}/invite/?token=${data.token}` : null; return { ok: true, invitation: data, link }; }
    case "revoke_invitation": { const { error } = await SB.from("invitations").delete().eq("organization_id", orgId).eq("id", args.id); if (error) throw error; return { ok: true }; }
    case "update_org": { const { data, error } = await SB.from("organizations").update(args.patch).eq("id", orgId).select().single(); if (error) throw error; return { ok: true, organization: data }; }
    case "set_dispo_decision": { const { data, error } = await SB.from("salarie_dispos").update({ statut_demande: args.decision, decided_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", args.id).select().single(); if (error) throw error; return { ok: true, dispo: data }; }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function lookupKey(rawKey: string) { const hash = await sha256Hex(rawKey); const { data } = await SB.from("api_keys").select("id, organization_id, revoked_at, scopes").eq("key_hash", hash).maybeSingle(); return (data && !data.revoked_at) ? data : null; }

function authMetadata() { return { issuer: PUBLIC_BASE, authorization_endpoint: AUTHORIZE_PAGE, token_endpoint: `${PUBLIC_BASE}/token`, registration_endpoint: `${PUBLIC_BASE}/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256","plain"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["read","write"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] }; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  const url = new URL(req.url);
  let p = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/mcp/, "");
  if (p === "") p = "/";
  const baseUrl = PUBLIC_BASE;

  if (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/") return json({ resource: baseUrl, authorization_servers: [baseUrl], scopes_supported: ["read","write"], bearer_methods_supported: ["header"] });
  if (p === "/.well-known/oauth-authorization-server" || p === "/.well-known/oauth-authorization-server/" || p === "/.well-known/openid-configuration" || p === "/.well-known/openid-configuration/") return json(authMetadata());
  if (p === "/register" && req.method === "POST") { const body = await req.json().catch(() => ({})); return json({ client_id: "client_" + crypto.randomUUID(), client_id_issued_at: Math.floor(Date.now()/1000), grant_types: ["authorization_code"], response_types: ["code"], redirect_uris: body.redirect_uris || [], token_endpoint_auth_method: "none", client_name: body.client_name || "Eatime360 MCP Client" }); }

  // GET /authorize → redirect 302 vers la page statique (au cas où quelqu'un appelle directement)
  if (p === "/authorize" && req.method === "GET") {
    const target = new URL(AUTHORIZE_PAGE);
    for (const [k,v] of url.searchParams.entries()) target.searchParams.set(k, v);
    const h = corsHeaders(); h.set("Location", target.toString());
    return new Response(null, { status: 302, headers: h });
  }
  // POST /authorize ← venant de la page HTML hors-domaine (avec api_key)
  if (p === "/authorize" && req.method === "POST") {
    const form = await req.formData();
    const apiKey = String(form.get("api_key")||"").trim();
    const redirectUri = String(form.get("redirect_uri")||"");
    const state = String(form.get("state")||"");
    const codeChallenge = String(form.get("code_challenge")||"");
    const codeChallengeMethod = String(form.get("code_challenge_method")||"");
    function redirectToPage(err: string) {
      const t = new URL(AUTHORIZE_PAGE);
      for (const [k,v] of form.entries()) if (k !== "api_key") t.searchParams.set(k, String(v));
      t.searchParams.set("error", err);
      const h = corsHeaders(); h.set("Location", t.toString());
      return new Response(null, { status: 302, headers: h });
    }
    if (!apiKey.startsWith("eat_")) return redirectToPage("Clé invalide (doit commencer par eat_)");
    const ak = await lookupKey(apiKey);
    if (!ak) return redirectToPage("Clé inconnue ou révoquée");
    if (!redirectUri) return new Response("Missing redirect_uri", { status: 400 });
    const code = await signPayload({ api_key: apiKey, cc: codeChallenge || null, ccm: codeChallengeMethod || null, exp: Math.floor(Date.now()/1000) + 300 });
    const redirect = new URL(redirectUri); redirect.searchParams.set("code", code); if (state) redirect.searchParams.set("state", state);
    const h = corsHeaders(); h.set("Location", redirect.toString());
    return new Response(null, { status: 302, headers: h });
  }
  if (p === "/token" && req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    let params: URLSearchParams;
    if (ct.includes("application/x-www-form-urlencoded")) params = new URLSearchParams(await req.text());
    else if (ct.includes("application/json")) { const b = await req.json(); params = new URLSearchParams(); for (const k of Object.keys(b)) params.set(k, String(b[k])); }
    else params = new URLSearchParams(await req.text());
    const grant = params.get("grant_type"); const code = params.get("code"); const codeVerifier = params.get("code_verifier");
    if (grant !== "authorization_code" || !code) return json({ error: "unsupported_grant_type" }, 400);
    const payload = await verifyPayload(code);
    if (!payload || (payload.exp && payload.exp < Math.floor(Date.now()/1000))) return json({ error: "invalid_grant", error_description: "Code invalide ou expiré" }, 400);
    if (payload.cc) {
      if (!codeVerifier) return json({ error: "invalid_request", error_description: "code_verifier required" }, 400);
      let computed = codeVerifier;
      if (payload.ccm === "S256") { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier)); computed = b64u(String.fromCharCode(...new Uint8Array(buf))); }
      if (computed !== payload.cc) return json({ error: "invalid_grant", error_description: "PKCE failed" }, 400);
    }
    const ak = await lookupKey(payload.api_key);
    if (!ak) return json({ error: "invalid_grant", error_description: "Clé révoquée" }, 400);
    return json({ access_token: payload.api_key, token_type: "Bearer", expires_in: 31536000, scope: (ak.scopes||[]).join(" ") });
  }

  if (p === "/" && req.method === "GET") return json({ name: "eatime360-mcp", version: "0.3.0", transport: "http", auth: "OAuth 2.1", tools_count: TOOLS.length });
  if (p === "/" && req.method === "POST") {
    const auth = req.headers.get("authorization") || "";
    const key = auth.replace(/^Bearer\s+/i, "").trim();
    if (!key) return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": `Bearer realm="eatime360", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"` });
    const ak = await lookupKey(key);
    if (!ak) return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": `Bearer realm="eatime360", error="invalid_token", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"` });
    SB.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", ak.id).then(() => {});
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { jsonrpc, method, params, id } = body || {};
    if (jsonrpc !== "2.0" || typeof method !== "string") return jrErr(id ?? null, -32600, "Invalid Request");
    try {
      if (method === "initialize") return jr(id, { protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "eatime360", version: "0.3.0" } });
      if (method === "notifications/initialized" || method === "notifications/cancelled") return new Response(null, { status: 202, headers: corsHeaders() });
      if (method === "tools/list") return jr(id, { tools: TOOLS });
      if (method === "tools/call") {
        const toolName = params?.name; const toolArgs = params?.arguments || {};
        if (!toolName) return jrErr(id, -32602, "Missing tool name");
        const writeTools = ["create_salarie","update_salarie","set_planning_cell","create_pointage","create_invitation","revoke_invitation","update_org","set_dispo_decision"];
        if (writeTools.includes(toolName) && !(ak.scopes||[]).includes("write")) return jr(id, { isError: true, content: [{ type: "text", text: "Cette clé n'a pas le scope 'write'." }] });
        try { const result = await runTool(ak.organization_id, toolName, toolArgs); return jr(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }); }
        catch (e: any) { return jr(id, { isError: true, content: [{ type: "text", text: `Error: ${e?.message || String(e)}` }] }); }
      }
      if (method === "resources/list" || method === "prompts/list") return jr(id, { [method.split("/")[0]]: [] });
      return jrErr(id, -32601, `Method not found: ${method}`);
    } catch (e: any) { return jrErr(id, -32603, e?.message || "Internal error"); }
  }
  return json({ error: "Not Found", pathname: url.pathname }, 404);
});
