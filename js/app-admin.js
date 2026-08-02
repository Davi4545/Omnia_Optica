import { initShell, enviarResetSenha } from "./session.js";
import {
  getStore, listStores, createStore, updateStore, listUsersByStore, listAllUsers,
  updateUserProfile, setStoreCode, deleteStoreCode, normalizeCode, subscribeState,
  exportarLoja, saveState, addRecord, saveCliente, saveOS, savePonto, saveProduto, saveFaixas
} from "./db.js";
import {
  $, esc, uid, toast, openModal, closeModal, wireModals, comprimirImagem, num, downloadBlob, dateKey
} from "./utils.js";

let CTX, STORE, EU;
let loja = null, usuarios = [], lojas = [], sellers = [];
let logoTemp = "", codeOriginal = "", busca = "", filtro = "todos";

init();
async function init() {
  CTX = await initShell("admin");
  STORE = CTX.storeId; EU = CTX.user.uid;
  if (!CTX.isAdmin) { semPermissao(); return; }

  wireModals(); wireEvents();
  if (CTX.profile.role === "superadmin") $("tabLojas").style.display = "inline-flex";

  // consultores da fila, para o vínculo usuário ↔ consultor
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; });

  await carregarLoja();
  try { lojas = await listStores(); } catch (_) { lojas = loja ? [loja] : []; }
  await carregarUsuarios();
  reveal();
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }
function semPermissao() {
  $("loading").style.display = "none"; $("appBody").style.display = "block";
  $("appBody").innerHTML = `<div class="card"><div class="cardBody"><div class="empty">
    <div class="glyph">🔒</div><div class="t">Acesso restrito</div>
    <div class="d">Esta área é apenas para gestores.</div></div></div></div>`;
}
const ehSuper = () => CTX.profile.role === "superadmin";

/* ================= MINHA ÓTICA ================= */
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
function linkConvite() {
  const code = normalizeCode($("lj_code").value || codeOriginal);
  if (!code) return "";
  return location.origin + location.pathname.replace(/admin\.html$/, "") + "login.html?code=" + encodeURIComponent(code);
}
function atualizaHintCode() {
  const c = normalizeCode($("lj_code").value);
  $("codeHint").innerHTML = c
    ? `Os consultores digitam exatamente: <b>${esc(c)}</b>`
    : `<span style="color:var(--stop)">Sem código, ninguém consegue criar conta nesta ótica.</span>`;
  const el = $("inviteLink");
  if (el) el.textContent = linkConvite() || "defina um código de acesso";
}
async function salvarLoja() {
  const nome = $("lj_nome").value.trim();
  const code = normalizeCode($("lj_code").value);
  if (!nome) { toast("Digite o nome da ótica."); return; }
  if (!code) { toast("Defina um código de acesso."); return; }
  try {
    await updateStore(STORE, { name: nome, code, logo: logoTemp });
    if (codeOriginal && normalizeCode(codeOriginal) !== code) await deleteStoreCode(codeOriginal).catch(() => {});
    await setStoreCode(code, STORE, nome);
    codeOriginal = code;
    $("lojaNome").textContent = nome;
    atualizaHintCode();
    toast("Ótica salva ✓");
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sem permissão. Confira as regras." : "Falha ao salvar.");
  }
}

/* ================= USUÁRIOS ================= */
async function carregarUsuarios() {
  try {
    usuarios = ehSuper() ? await listAllUsers() : await listUsersByStore(STORE);
  } catch (e) {
    console.error(e);
    $("usersBox").innerHTML = `<div class="hint" style="color:var(--stop)">Não foi possível listar os usuários. Verifique se as regras do Firestore foram publicadas.</div>`;
    return;
  }
  renderUsuarios();
}
const nomeLoja = (id) => (lojas.find((l) => l.id === id) || {}).name || id || "—";
const papelLabel = (r) => r === "superadmin" ? "Super admin" : r === "admin" ? "Gestor" : "Consultor";
function quandoAcesso(ts) {
  if (!ts) return "nunca acessou";
  const dias = Math.floor((Date.now() - ts) / 864e5);
  if (dias === 0) return "acessou hoje";
  if (dias === 1) return "acessou ontem";
  if (dias < 30) return `acessou há ${dias} dias`;
  return "acessou em " + new Date(ts).toLocaleDateString("pt-BR");
}
function listaFiltrada() {
  const t = busca.trim().toLowerCase();
  return usuarios.filter((u) => {
    if (t && !(u.name || "").toLowerCase().includes(t) && !(u.email || "").toLowerCase().includes(t)) return false;
    if (filtro === "ativos" && u.active === false) return false;
    if (filtro === "inativos" && u.active !== false) return false;
    if (filtro === "gestores" && u.role === "seller") return false;
    if (filtro === "semvinculo" && u.sellerId) return false;
    return true;
  });
}
function renderUsuarios() {
  const ativos = usuarios.filter((u) => u.active !== false).length;
  const gestores = usuarios.filter((u) => u.role === "admin" || u.role === "superadmin").length;
  const semv = usuarios.filter((u) => !u.sellerId).length;
  $("userKpis").innerHTML = [
    { t: "Usuários", v: num(usuarios.length) },
    { t: "Ativos", v: num(ativos), accent: true },
    { t: "Gestores", v: num(gestores) },
    { t: "Sem vínculo", v: num(semv) }
  ].map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v">${k.v}</div></div>`).join("");

  const list = listaFiltrada();
  const box = $("usersBox");
  if (!usuarios.length) {
    box.innerHTML = `<div class="empty"><div class="glyph">👥</div><div class="t">Nenhum usuário ainda</div>
      <div class="d">Compartilhe o link de convite acima para a equipe criar as contas.</div></div>`;
    return;
  }
  if (!list.length) { box.innerHTML = `<div class="hint">Nenhum usuário corresponde ao filtro.</div>`; return; }

  const ordem = { superadmin: 0, admin: 1, seller: 2 };
  list.sort((a, b) => (ordem[a.role] ?? 3) - (ordem[b.role] ?? 3) || (a.name || "").localeCompare(b.name || "", "pt-BR"));

  box.innerHTML = `<table><thead><tr><th>Pessoa</th><th>Papel</th><th>Ótica</th><th>Consultor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${list.map((u) => {
      const eu = u.uid === EU, sa = u.role === "superadmin";
      const vinc = sellers.find((s) => s.id === u.sellerId);
      const inicial = esc(((u.name || u.email || "?").trim()[0] || "?").toUpperCase());
      return `<tr class="clickRow" data-user="${esc(u.uid)}">
        <td><div style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="width:32px;height:32px;font-size:14px">${inicial}</div>
          <div style="min-width:0"><b>${esc(u.name || "—")}</b>${eu ? ' <span class="tag">você</span>' : ""}
          <div class="tiny" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(u.email || "—")}</div></div>
        </div></td>
        <td><span class="etapa ${u.role === "seller" ? "lead" : "fechado"}">${esc(papelLabel(u.role))}</span></td>
        <td class="tiny" style="text-transform:none;letter-spacing:0">${esc(nomeLoja(u.storeId))}${(u.storeIds || []).length ? ` <span class="tag">+${u.storeIds.length}</span>` : ""}</td>
        <td>${vinc ? esc(vinc.nome) : '<span class="tag warn">sem vínculo</span>'}</td>
        <td>${u.active === false ? '<span class="tag warn">Inativo</span>' : '<span class="tag go">Ativo</span>'}</td>
        <td>${eu || sa ? "" : `<button class="btn ghost sm" data-edit="${esc(u.uid)}">Gerenciar</button>`}</td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}

/* ---------- modal do usuário ---------- */
function abrirUsuario(uidAlvo) {
  const u = usuarios.find((x) => x.uid === uidAlvo);
  if (!u) return;
  if (u.role === "superadmin") { toast("O super admin não pode ser alterado aqui."); return; }
  if (u.uid === EU) { toast("Você não pode alterar o próprio acesso."); return; }

  $("u_uid").value = u.uid;
  $("userTitle").textContent = "Gerenciar acesso";
  $("u_ini").textContent = ((u.name || u.email || "?").trim()[0] || "?").toUpperCase();
  $("u_nome").textContent = u.name || "—";
  $("u_email").textContent = u.email || "—";
  $("u_acesso").textContent = quandoAcesso(u.ultimoAcesso);
  $("u_role").value = u.role === "admin" ? "admin" : "seller";
  $("u_active").value = u.active === false ? "false" : "true";
  $("u_roleHint").textContent = u.role === "admin"
    ? "Gestor edita catálogo, comissão e usuários."
    : "Consultor atende, registra vendas e abre OS.";

  // ótica principal: gestor comum só enxerga a própria
  const disponiveis = ehSuper() ? lojas : lojas.filter((l) => l.id === STORE);
  $("u_store").innerHTML = disponiveis.map((l) => `<option value="${esc(l.id)}">${esc(l.name || l.id)}</option>`).join("");
  $("u_store").value = u.storeId || STORE;
  $("u_store").disabled = !ehSuper();
  $("u_storeHint").textContent = ehSuper()
    ? "Você pode mover esta pessoa entre óticas."
    : "Só o super admin move alguém para outra ótica.";

  // acesso adicional (multi-loja)
  const extras = u.storeIds || [];
  $("u_stores").innerHTML = disponiveis.length > 1
    ? disponiveis.filter((l) => l.id !== (u.storeId || STORE))
        .map((l) => `<div class="chip${extras.includes(l.id) ? " on" : ""}" data-store="${esc(l.id)}">${esc(l.name || l.id)}</div>`).join("")
      || `<div class="hint">Nenhuma outra ótica disponível.</div>`
    : `<div class="hint">Só existe uma ótica cadastrada.</div>`;

  // vínculo com consultor da fila
  const usados = usuarios.filter((x) => x.sellerId && x.uid !== u.uid).map((x) => x.sellerId);
  $("u_seller").innerHTML = `<option value="">— sem vínculo —</option>` +
    sellers.filter((s) => s.ativo && (!usados.includes(s.id) || s.id === u.sellerId))
      .map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");
  $("u_seller").value = u.sellerId || "";

  openModal("userBack");
}
async function salvarUsuario() {
  const uidAlvo = $("u_uid").value;
  const u = usuarios.find((x) => x.uid === uidAlvo); if (!u) return;
  const novoRole = $("u_role").value;
  const novoAtivo = $("u_active").value === "true";
  const novaLoja = $("u_store").value;
  const extras = [...$("u_stores").querySelectorAll(".chip.on")].map((c) => c.dataset.store);
  const sellerId = $("u_seller").value;

  if (!novoAtivo && u.active !== false &&
      !confirm(`Desativar ${u.name || "este usuário"}? Ele perde o acesso imediatamente.`)) return;

  const dados = { role: novoRole, active: novoAtivo, sellerId, storeIds: extras };
  if (ehSuper()) dados.storeId = novaLoja;

  try {
    await updateUserProfile(uidAlvo, dados);
    Object.assign(u, dados);
    closeModal("userBack"); renderUsuarios();
    toast("Acesso atualizado ✓");
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied"
      ? "Sem permissão. Mover entre óticas exige super admin."
      : "Falha ao salvar.");
  }
}
async function resetarSenha() {
  const u = usuarios.find((x) => x.uid === $("u_uid").value);
  if (!u || !u.email) { toast("Usuário sem e-mail cadastrado."); return; }
  if (!confirm(`Enviar link de redefinição de senha para ${u.email}?`)) return;
  try { await enviarResetSenha(u.email); toast("Link enviado para " + u.email + " ✓"); }
  catch (e) { console.error(e); toast("Não foi possível enviar o link."); }
}

/* ================= BACKUP ================= */
function nomeArquivo(sufixo, ext) {
  const l = (loja && loja.name ? loja.name : "otica").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `omnia-${l}-${sufixo}-${dateKey()}.${ext}`;
}
async function backupJson() {
  $("backupStatus").textContent = "Lendo os dados…";
  try {
    const dump = await exportarLoja(STORE);
    const falhas = Object.entries(dump).filter(([, v]) => v && v.erro).map(([k]) => k);
    downloadBlob(JSON.stringify(dump, null, 2), nomeArquivo("backup", "json"), "application/json");
    const n = ["records", "clientes", "os", "ponto", "produtos"].reduce((a, k) => a + (Array.isArray(dump[k]) ? dump[k].length : 0), 0);
    $("backupStatus").innerHTML = falhas.length
      ? `Baixado com <b>${num(n)}</b> registros. Não consegui ler: <b>${esc(falhas.join(", "))}</b> (permissão).`
      : `Baixado com <b>${num(n)}</b> registros ✓`;
    toast("Backup gerado ✓");
  } catch (e) { console.error(e); $("backupStatus").textContent = "Falha ao gerar o backup."; }
}
// converte lista de objetos em CSV (ponto e vírgula, padrão pt-BR do Excel)
function paraCsv(lista) {
  if (!lista || !lista.length) return "";
  const cols = [...new Set(lista.flatMap((o) => Object.keys(o)))];
  const val = (v) => {
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const linhas = [cols, ...lista.map((o) => cols.map((c) => val(o[c])))];
  return linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
async function backupCsv() {
  $("backupStatus").textContent = "Gerando planilhas…";
  try {
    const dump = await exportarLoja(STORE);
    let n = 0;
    for (const chave of ["records", "clientes", "os", "ponto", "produtos"]) {
      const lista = dump[chave];
      if (!Array.isArray(lista) || !lista.length) continue;
      downloadBlob(paraCsv(lista), nomeArquivo(chave, "csv"));
      n++;
      await new Promise((r) => setTimeout(r, 400)); // o navegador bloqueia downloads em rajada
    }
    $("backupStatus").innerHTML = n ? `<b>${n}</b> planilha(s) baixada(s) ✓` : "Não há dados para exportar.";
  } catch (e) { console.error(e); $("backupStatus").textContent = "Falha ao gerar as planilhas."; }
}
async function restaurar() {
  const f = $("restoreFile").files && $("restoreFile").files[0];
  if (!f) { toast("Escolha um arquivo primeiro."); return; }
  let dump;
  try { dump = JSON.parse(await f.text()); }
  catch (_) { $("restoreStatus").innerHTML = "<b style='color:var(--stop)'>Arquivo inválido.</b>"; return; }
  const total = ["records", "clientes", "os", "ponto", "produtos"].reduce((a, k) => a + (Array.isArray(dump[k]) ? dump[k].length : 0), 0);
  if (!confirm(`Restaurar ${total} registros nesta ótica? Documentos com o mesmo id serão sobrescritos.`)) return;

  $("restoreStatus").textContent = "Restaurando…";
  let feitos = 0, erros = 0;
  const grava = async (fn, item) => { try { await fn(STORE, item); feitos++; } catch (_) { erros++; } };
  try {
    if (dump.estado) await grava(saveState, dump.estado);
    if (Array.isArray(dump.comissao) && dump.comissao.length) await grava(saveFaixas, dump.comissao);
    for (const r of dump.records  || []) await grava(addRecord, r);
    for (const c of dump.clientes || []) await grava(saveCliente, c);
    for (const o of dump.os       || []) await grava(saveOS, o);
    for (const p of dump.ponto    || []) await grava(savePonto, p);
    for (const p of dump.produtos || []) await grava(saveProduto, p);
    $("restoreStatus").innerHTML = `Restaurados <b>${num(feitos)}</b> registros${erros ? ` · <b style="color:var(--stop)">${erros} falharam</b>` : " ✓"}`;
    toast("Restauração concluída");
  } catch (e) { console.error(e); $("restoreStatus").textContent = "Falha na restauração."; }
}

/* ================= TODAS AS ÓTICAS ================= */
async function carregarLojas() {
  try { lojas = await listStores(); } catch (_) { lojas = []; }
  const box = $("lojasBox");
  if (!lojas.length) { box.innerHTML = `<div class="hint">Nenhuma ótica cadastrada.</div>`; return; }
  box.innerHTML = `<table><thead><tr><th>Ótica</th><th>Código</th><th class="num">Usuários</th><th></th></tr></thead><tbody>
    ${lojas.map((l) => `<tr>
      <td><b>${esc(l.name || "—")}</b><div class="tiny" style="text-transform:none;letter-spacing:0">${esc(l.id)}</div></td>
      <td class="mono">${esc(l.code || "—")}</td>
      <td class="num">${num(usuarios.filter((u) => u.storeId === l.id).length)}</td>
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

/* ================= EVENTOS ================= */
function wireEvents() {
  document.querySelectorAll(".tab[data-adm]").forEach((t) => t.addEventListener("click", async () => {
    document.querySelectorAll(".tab[data-adm]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const v = t.dataset.adm;
    ["loja", "usuarios", "backup", "lojas"].forEach((k) => {
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
    try { logoTemp = await comprimirImagem(f, 256, 0.85);
      const p = $("lj_logo_prev"); p.src = logoTemp; p.style.display = "block";
    } catch (_) { toast("Não deu para ler a imagem."); }
  });

  $("btnCopiarConvite").addEventListener("click", async () => {
    const l = linkConvite();
    if (!l) { toast("Defina e salve um código de acesso primeiro."); return; }
    try { await navigator.clipboard.writeText(l); toast("Link copiado ✓"); }
    catch (_) { toast("Copie manualmente: " + l); }
  });

  $("btnRecarregarUsers").addEventListener("click", carregarUsuarios);
  $("userSearch").addEventListener("input", (e) => { busca = e.target.value; renderUsuarios(); });
  $("userFiltro").addEventListener("change", (e) => { filtro = e.target.value; renderUsuarios(); });
  $("usersBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]"); if (b) { e.stopPropagation(); abrirUsuario(b.dataset.edit); return; }
    const row = e.target.closest("[data-user]"); if (row) abrirUsuario(row.dataset.user);
  });
  $("u_stores").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) c.classList.toggle("on"); });
  $("btnSalvarUser").addEventListener("click", salvarUsuario);
  $("btnResetSenha").addEventListener("click", resetarSenha);

  $("btnBackupJson").addEventListener("click", backupJson);
  $("btnBackupCsv").addEventListener("click", backupCsv);
  $("btnRestaurar").addEventListener("click", restaurar);

  $("btnNovaLoja").addEventListener("click", () => openModal("lojaBack"));
  $("btnCriarLoja").addEventListener("click", criarLoja);
  $("lojasBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-abrir]");
    if (b) { localStorage.setItem("omnia_store", b.dataset.abrir); location.reload(); }
  });
}
