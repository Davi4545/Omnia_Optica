// ============================================================
// OMNIA Ótica — sessão, guarda de autenticação e shell (header+nav)
// ============================================================
import { auth, SUPER_ADMIN_EMAIL } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getUserProfile, getStore, listStores } from "./db.js";
import { esc } from "./utils.js";

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

// Resolve loja ativa a partir do perfil (+ escolha salva)
async function resolveStoreId(profile) {
  if (profile.storeId) return profile.storeId;
  const saved = localStorage.getItem("omnia_store");
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
export function initShell(activeKey) {
  applyTema();
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
      renderHeader({ user, profile, store, activeKey, admin });
      resolvido = true;
      resolve({ user, profile, storeId, store, isAdmin: admin });
    });
  });
}

function renderHeader({ user, profile, store, activeKey, admin }) {
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
  document.getElementById("btnTema").addEventListener("click", toggleTema);
  document.getElementById("btnLogout").addEventListener("click", async () => {
    await signOut(auth); location.replace("login.html");
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
