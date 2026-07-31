import { initShell } from "./session.js";
import {
  getStore, listStores, createStore, updateStore, listUsersByStore,
  updateUserProfile, setStoreCode, deleteStoreCode, normalizeCode
} from "./db.js";
import { $, esc, uid, toast, openModal, closeModal, wireModals, comprimirImagem, fmtData } from "./utils.js";

let CTX, STORE, loja = null, usuarios = [], lojas = [], logoTemp = "", codeOriginal = "";

init();
async function init() {
  CTX = await initShell("admin");
  STORE = CTX.storeId;

  if (!CTX.isAdmin) { semPermissao(); return; }

  wireModals(); wireEvents();
  if (CTX.profile.role === "superadmin") $("tabLojas").style.display = "inline-flex";

  await carregarLoja();
  await carregarUsuarios();
  reveal();
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }
function semPermissao() {
  $("loading").style.display = "none";
  $("appBody").style.display = "block";
  $("appBody").innerHTML = `<div class="card"><div class="cardBody"><div class="empty">
    <div class="glyph">🔒</div><div class="t">Acesso restrito</div>
    <div class="d">Esta área é apenas para gestores. Peça a um administrador para alterar seu papel.</div>
  </div></div></div>`;
}

/* ---------- minha ótica ---------- */
async function carregarLoja() {
  loja = (await getStore(STORE)) || { id: STORE, name: "", code: "", logo: "" };
  $("lojaNome").textContent = loja.name || "Minha ótica";
  $("lj_nome").value = loja.name || "";
  $("lj_code").value = loja.code || "";
  codeOriginal = loja.code || "";
  logoTemp = loja.logo || "";
  const prev = $("lj_logo_prev");
  if (logoTemp) { prev.src = logoTemp; prev.style.display = "block"; } else prev.style.display = "none";
  atualizaHintCode();
}
function atualizaHintCode() {
  const c = normalizeCode($("lj_code").value);
  $("codeHint").innerHTML = c
    ? `Os consultores vão digitar exatamente: <b>${esc(c)}</b>`
    : `<span style="color:var(--stop)">Sem código, ninguém consegue criar conta nesta ótica.</span>`;
}
async function salvarLoja() {
  const nome = $("lj_nome").value.trim();
  const code = normalizeCode($("lj_code").value);
  if (!nome) { toast("Digite o nome da ótica."); return; }
  if (!code) { toast("Defina um código de acesso."); return; }
  try {
    await updateStore(STORE, { name: nome, code, logo: logoTemp });
    // mantém o índice /storeCodes coerente
    if (codeOriginal && normalizeCode(codeOriginal) !== code) {
      await deleteStoreCode(codeOriginal).catch(() => {});
    }
    await setStoreCode(code, STORE, nome);
    codeOriginal = code;
    $("lojaNome").textContent = nome;
    toast("Ótica salva ✓");
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sem permissão. Confira as regras." : "Falha ao salvar.");
  }
}

/* ---------- usuários ---------- */
async function carregarUsuarios() {
  try {
    usuarios = await listUsersByStore(STORE);
  } catch (e) {
    console.error(e);
    $("usersBox").innerHTML = `<div class="hint" style="color:var(--stop)">Não foi possível listar os usuários. Verifique se as regras do Firestore foram publicadas.</div>`;
    return;
  }
  renderUsuarios();
}
function renderUsuarios() {
  const box = $("usersBox");
  if (!usuarios.length) {
    box.innerHTML = `<div class="empty"><div class="glyph">👥</div><div class="t">Nenhum usuário ainda</div>
      <div class="d">Compartilhe o código de acesso para que a equipe crie as contas.</div></div>`;
    return;
  }
  const ordem = { superadmin: 0, admin: 1, seller: 2 };
  const list = usuarios.slice().sort((a, b) =>
    (ordem[a.role] ?? 3) - (ordem[b.role] ?? 3) || (a.name || "").localeCompare(b.name || "", "pt-BR"));
  box.innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>
    ${list.map((u) => {
      const eu = u.uid === CTX.user.uid;
      const sa = u.role === "superadmin";
      return `<tr>
        <td><b>${esc(u.name || "—")}</b>${eu ? ' <span class="tag">você</span>' : ""}</td>
        <td class="hint" style="text-transform:none">${esc(u.email || "—")}</td>
        <td>
          <select data-role="${esc(u.uid)}" ${sa || eu ? "disabled" : ""} style="padding:6px 10px;border-radius:9px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-family:inherit;font-size:13px">
            <option value="seller" ${u.role === "seller" ? "selected" : ""}>Consultor</option>
            <option value="admin"  ${u.role === "admin" ? "selected" : ""}>Gestor</option>
            ${sa ? '<option value="superadmin" selected>Super admin</option>' : ""}
          </select>
        </td>
        <td>${u.active === false
              ? '<span class="tag warn">Inativo</span>'
              : '<span class="tag go">Ativo</span>'}</td>
        <td>${eu || sa ? "" : `<button class="btn ghost sm" data-toggle="${esc(u.uid)}">${u.active === false ? "Reativar" : "Desativar"}</button>`}</td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}
async function mudarPapel(uidAlvo, novo) {
  const u = usuarios.find((x) => x.uid === uidAlvo); if (!u) return;
  try {
    await updateUserProfile(uidAlvo, { role: novo });
    u.role = novo; renderUsuarios(); toast("Papel atualizado ✓");
  } catch (e) { console.error(e); toast("Sem permissão para alterar."); renderUsuarios(); }
}
async function alternarAtivo(uidAlvo) {
  const u = usuarios.find((x) => x.uid === uidAlvo); if (!u) return;
  const novo = u.active === false;
  if (!novo && !confirm(`Desativar ${u.name || "este usuário"}? Ele perde o acesso imediatamente.`)) return;
  try {
    await updateUserProfile(uidAlvo, { active: novo });
    u.active = novo; renderUsuarios();
    toast(novo ? "Usuário reativado ✓" : "Usuário desativado.");
  } catch (e) { console.error(e); toast("Sem permissão para alterar."); }
}

/* ---------- todas as óticas (super admin) ---------- */
async function carregarLojas() {
  try { lojas = await listStores(); } catch (e) { lojas = []; }
  const box = $("lojasBox");
  if (!lojas.length) { box.innerHTML = `<div class="hint">Nenhuma ótica cadastrada.</div>`; return; }
  box.innerHTML = `<table><thead><tr><th>Ótica</th><th>Código</th><th>ID</th><th></th></tr></thead><tbody>
    ${lojas.map((l) => `<tr>
      <td><b>${esc(l.name || "—")}</b></td>
      <td class="mono">${esc(l.code || "—")}</td>
      <td class="hint" style="text-transform:none">${esc(l.id)}</td>
      <td><button class="btn ghost sm" data-abrir="${esc(l.id)}">${l.id === STORE ? "Atual" : "Abrir"}</button></td>
    </tr>`).join("")}
  </tbody></table>`;
}
async function criarLoja() {
  const nome = $("nl_nome").value.trim();
  const code = normalizeCode($("nl_code").value);
  if (!nome || !code) { toast("Preencha nome e código."); return; }
  const id = "loja_" + uid().slice(0, 10);
  try {
    await createStore(id, { name: nome, code, logo: "", criadoEm: Date.now() });
    await setStoreCode(code, id, nome);
    closeModal("lojaBack");
    $("nl_nome").value = ""; $("nl_code").value = "";
    await carregarLojas();
    toast("Ótica criada ✓");
  } catch (e) { console.error(e); toast("Falha ao criar. Apenas o super admin pode."); }
}

/* ---------- eventos ---------- */
function wireEvents() {
  document.querySelectorAll(".tab[data-adm]").forEach((t) => t.addEventListener("click", async () => {
    document.querySelectorAll(".tab[data-adm]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const v = t.dataset.adm;
    ["loja", "usuarios", "lojas"].forEach((k) => {
      const el = $("adm" + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.style.display = k === v ? "block" : "none";
    });
    if (v === "lojas") await carregarLojas();
    if (v === "usuarios") await carregarUsuarios();
  }));

  $("btnSalvarLoja").addEventListener("click", salvarLoja);
  $("lj_code").addEventListener("input", atualizaHintCode);
  $("lj_logo_inp").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      logoTemp = await comprimirImagem(f, 256, 0.85);
      const p = $("lj_logo_prev"); p.src = logoTemp; p.style.display = "block";
    } catch (_) { toast("Não deu para ler a imagem."); }
  });

  $("btnRecarregarUsers").addEventListener("click", carregarUsuarios);
  $("usersBox").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-role]");
    if (sel) mudarPapel(sel.dataset.role, sel.value);
  });
  $("usersBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-toggle]");
    if (b) alternarAtivo(b.dataset.toggle);
  });

  $("btnNovaLoja").addEventListener("click", () => openModal("lojaBack"));
  $("btnCriarLoja").addEventListener("click", criarLoja);
  $("lojasBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-abrir]");
    if (b) { localStorage.setItem("omnia_store", b.dataset.abrir); location.reload(); }
  });
}
