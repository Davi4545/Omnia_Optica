// ============================================================
// OMNIA Ótica — sessão, guarda de autenticação e shell (header+nav)
// ============================================================
import { auth, SUPER_ADMIN_EMAIL } from "./firebase.js";
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getUserProfile, getStore, listStores, updateUserProfile } from "./db.js";
import { esc, mostrarFalha } from "./utils.js";

const NAV = [
  { key: "ops",        href: "index.html",       label: "Atendimento" },
  { key: "clientes",   href: "clientes.html",    label: "Clientes" },
  { key: "lab",        href: "laboratorio.html", label: "Laboratório" },
  { key: "catalogo",   href: "catalogo.html",    label: "Catálogo" },
  { key: "comissao",   href: "comissao.html",    label: "Comissão" },
  { key: "ponto",      href: "ponto.html",       label: "Ponto" },
  { key: "relatorios", href: "relatorios.html",  label: "Relatórios" },
  { key: "admin",      href: "admin.html",       label: "Gestão", adminOnly: true }
];

export function getTema() { return localStorage.getItem("omnia_tema") === "exame" ? "exame" : "refracao"; }
export function applyTema() { document.body.dataset.theme = getTema(); }
export function toggleTema() {
  localStorage.setItem("omnia_tema", getTema() === "exame" ? "refracao" : "exame");
  applyTema();
}

function isAdmin(role) { return role === "admin" || role === "superadmin"; }

// Envia link de redefinição de senha. Usado no login e no painel de gestão.
export async function enviarResetSenha(email) {
  await sendPasswordResetEmail(auth, email);
}

// Lojas às quais o usuário tem acesso (principal + adicionais)
export function lojasDoUsuario(profile) {
  const ids = [];
  if (profile.storeId) ids.push(profile.storeId);
  (profile.storeIds || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); });
  return ids;
}

// Resolve loja ativa a partir do perfil (+ escolha salva)
async function resolveStoreId(profile) {
  const saved = localStorage.getItem("omnia_store");
  const permitidas = lojasDoUsuario(profile);
  // respeita a loja escolhida no seletor, desde que o usuário tenha acesso
  if (saved && (permitidas.includes(saved) || profile.role === "superadmin")) return saved;
  if (profile.storeId) return profile.storeId;
  if (saved) return saved;
  if (Array.isArray(profile.storeIds) && profile.storeIds.length) return profile.storeIds[0];
  if (profile.role === "superadmin") {
    const stores = await listStores();
    if (stores[0]) return stores[0].id;
  }
  return null;
}

/**
 * Garante sessão e monta o shell. Retorna { user, profile, storeId, store }.
 * Redireciona para login se não autenticado.
 */
// Traduz o erro do Firestore em algo que a pessoa consiga resolver
function explicaErro(d) {
  const c = (d.code || "") + " " + (d.message || "");
  if (c.includes("permission-denied"))
    return ["Sem permissão para ler os dados",
      "Publique o arquivo firestore.rules no Console do Firebase e confira se o seu usuário tem o campo storeId preenchido."];
  if (c.includes("unavailable") || c.includes("network"))
    return ["Sem conexão com o servidor", "Verifique sua internet e tente de novo."];
  if (c.includes("failed-precondition"))
    return ["O banco precisa de um índice", "Abra o console do navegador (F12): o Firebase mostra um link para criar o índice automaticamente."];
  return ["Não foi possível carregar os dados", d.message || "Tente novamente em instantes."];
}

// Vigia: se nada aparecer em 12s, avisa em vez de girar para sempre
function armarVigia() {
  setTimeout(() => {
    const body = document.getElementById("appBody");
    const load = document.getElementById("loading");
    if (body && body.style.display === "none" && load && load.style.display !== "none") {
      mostrarFalha("Está demorando mais que o normal",
        "Os dados não chegaram. Verifique a conexão e se as regras do Firestore foram publicadas.");
    }
  }, 12000);
}

export function initShell(activeKey) {
  applyTema();
  // Falha em qualquer assinatura de dados vira mensagem, não tela travada
  if (!window.__omniaErroLigado) {
    window.__omniaErroLigado = true;
    window.addEventListener("omnia:erro-dados", (ev) => {
      const [t, d] = explicaErro(ev.detail || {});
      mostrarFalha(t, d);
    });
  }
  armarVigia();
  let resolvido = false; // onAuthStateChanged dispara de novo ao renovar o token
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { location.replace("login.html"); return; }
      if (resolvido) return;

      let profile = null;
      try {
        profile = await getUserProfile(user.uid);
      } catch (e) {
        // regras negando leitura do próprio perfil = configuração incorreta
        renderErro("Não foi possível ler seu perfil. Publique as regras do Firestore (firestore.rules).");
        return;
      }
      if (!profile) {
        profile = { uid: user.uid, role: "seller", email: user.email,
                    name: user.displayName || user.email, active: true };
      }
      // O super admin também é reconhecido pelas regras via e-mail do token
      if (user.email === SUPER_ADMIN_EMAIL) profile.role = "superadmin";
      if (profile.active === false) {
        await signOut(auth);
        location.replace("login.html");
        return;
      }

      const storeId = await resolveStoreId(profile);
      if (!storeId) { renderNoStore(); return; }

      localStorage.setItem("omnia_store", storeId);
      let store = null;
      try { store = await getStore(storeId); } catch (e) { store = null; }
      if (!store) store = { id: storeId, name: "Ótica" };

      const admin = isAdmin(profile.role);
      renderHeader({ user, profile, store, activeKey, admin, storeId });

      // Marca o último acesso — só uma vez por sessão, para não gerar escritas à toa.
      if (!sessionStorage.getItem("omnia_touch")) {
        sessionStorage.setItem("omnia_touch", "1");
        updateUserProfile(user.uid, { ultimoAcesso: Date.now() }).catch(() => {});
      }
      resolvido = true;
      resolve({ user, profile, storeId, store, isAdmin: admin });
    });
  });
}

function renderHeader({ user, profile, store, activeKey, admin, storeId }) {
  const el = document.getElementById("appHeader");
  if (!el) return;
  const roleLabel = profile.role === "superadmin" ? "Super admin" : profile.role === "admin" ? "Gestor" : "Consultor";
  el.innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <div class="brand">
          <div class="logoLens" aria-hidden="true">${store.logo ? `<img src="${esc(store.logo)}" alt="">` : ""}</div>
          <div>
            <h1>OMNIA</h1>
            <div class="sub"><b>${esc(store.name || "Ótica")}</b> · sistema para óticas</div>
          </div>
        </div>
        <div class="rightTop">
          <span id="storeSwitchWrap"></span>
          <span class="badgeRole">${esc(roleLabel)}</span>
          <button class="btn ghost sm" id="btnTema" title="Alternar tema">◐ Tema</button>
          <button class="btn ghost sm" id="btnLogout">Sair</button>
        </div>
      </div>
      <nav class="navlinks">
        ${NAV.filter((n) => !n.adminOnly || admin)
             .map((n) => `<a href="${n.href}" class="${n.key === activeKey ? "active" : ""}">${esc(n.label)}</a>`).join("")}
      </nav>
    </div>`;
  montarSeletorLoja(profile, storeId);
  document.getElementById("btnTema").addEventListener("click", toggleTema);
  document.getElementById("btnLogout").addEventListener("click", async () => {
    await signOut(auth); location.replace("login.html");
  });
}

// Seletor de ótica — só aparece para quem tem acesso a mais de uma
async function montarSeletorLoja(profile, atual) {
  const wrap = document.getElementById("storeSwitchWrap");
  if (!wrap) return;
  let ids = lojasDoUsuario(profile);
  let nomes = {};
  try {
    if (profile.role === "superadmin") {
      const todas = await listStores();
      ids = todas.map((s) => s.id);
      todas.forEach((s) => { nomes[s.id] = s.name || s.id; });
    } else {
      for (const id of ids) {
        const s = await getStore(id).catch(() => null);
        nomes[id] = (s && s.name) || id;
      }
    }
  } catch (_) { return; }
  if (ids.length < 2) return;

  wrap.innerHTML = `<select id="storeSwitch" class="storeSwitch" title="Trocar de ótica">
    ${ids.map((id) => `<option value="${esc(id)}"${id === atual ? " selected" : ""}>${esc(nomes[id] || id)}</option>`).join("")}
  </select>`;
  document.getElementById("storeSwitch").addEventListener("change", (e) => {
    localStorage.setItem("omnia_store", e.target.value);
    location.reload();
  });
}

function renderErro(texto) {
  const main = document.querySelector("main");
  if (main) main.innerHTML = `<div class="wrap"><div class="card"><div class="cardBody"><div class="empty">
    <div class="glyph">⚠️</div><div class="t">Configuração pendente</div>
    <div class="d">${esc(texto)}</div>
    <button class="btn ghost sm" style="margin-top:14px" onclick="location.reload()">Tentar de novo</button>
    </div></div></div></div>`;
}

function renderNoStore() {
  const el = document.getElementById("appHeader");
  const main = document.querySelector("main");
  if (el) el.innerHTML = `<div class="wrap"><div class="topbar"><div class="brand"><div class="logoLens"></div><div><h1>OMNIA</h1><div class="sub">sistema para óticas</div></div></div>
    <div class="rightTop"><button class="btn ghost sm" id="btnLogout2">Sair</button></div></div></div>`;
  if (main) main.innerHTML = `<div class="wrap"><div class="card"><div class="cardBody"><div class="empty">
    <div class="glyph">🏬</div><div class="t">Sua conta ainda não está vinculada a uma ótica</div>
    <div class="d">Peça a um gestor para vincular seu usuário a uma ótica no painel de administração.</div></div></div></div></div>`;
  const b = document.getElementById("btnLogout2");
  if (b) b.addEventListener("click", async () => { await signOut(auth); location.replace("login.html"); });
}
