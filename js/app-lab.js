import { initShell } from "./session.js";
import { subscribeState, subscribeOS, saveOS, deleteOS } from "./db.js";
import { $, esc, uid, money, num, dateKey, monthKey, fmtData, brNum, toast, openModal, closeModal, wireModals } from "./utils.js";
import {
  MATERIAIS, TIPOS_LENTE_OS, TRAT_LENTE, OS_STATUS,
  statusInfo, proximoStatus, osNumero, rxResumo, options
} from "./domain.js";

let CTX, STORE, PODE_APAGAR = false;
let sellers = [];
let labs = [];
let osList = [];
let osEditId = null;

init();
async function init() {
  CTX = await initShell("lab");
  STORE = CTX.storeId;
  // Excluir OS é restrito a gestor nas regras do Firestore.
  PODE_APAGAR = !!CTX.isAdmin;
  wireModals();
  fillSelectsBase();
  wireEvents();
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; labs = (st && st.labs) || labs; });
  subscribeOS(STORE, (list) => {
    osList = list.map(normalizaOS);
    labs = [...new Set([...(labs || []), ...list.map((o) => o.laboratorio).filter(Boolean)])];
    reveal();
    try { renderLab(); }
    catch (e) { console.error("renderLab", e); toast("Alguns dados de OS estão incompletos."); }
    checkPrefill();
  });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }

// Documento vindo do banco pode estar incompleto (versão antiga, gravação parcial,
// edição manual no Console). Garantimos a forma antes de qualquer render.
function normalizaOS(o) {
  return {
    ...o,
    status: o.status || "aberta",
    numero: Number(o.numero || 0),
    clienteNome: o.clienteNome || "",
    receita: o.receita || null,
    armacao: o.armacao || {},
    lente: o.lente || {},
    laboratorio: o.laboratorio || "",
    valores: { armacao: 0, lente: 0, total: 0, sinal: 0, saldo: 0, ...(o.valores || {}) },
    datas: { entrada: "", previsao: "", entrega: "", ...(o.datas || {}) }
  };
}

function osAtrasada(o) { return o.datas && o.datas.previsao && o.datas.previsao < dateKey() && o.status !== "entregue"; }

function renderLab() {
  const mes = monthKey(); // LOCAL — toISOString() usaria UTC e erraria o mês
  const kAberto = osList.filter((o) => o.status !== "entregue").length;
  const kLab = osList.filter((o) => o.status === "enviada" || o.status === "producao").length;
  const kAtraso = osList.filter(osAtrasada).length;
  const kEntreg = osList.filter((o) => o.status === "entregue" && (o.datas.entrega || "").slice(0, 7) === mes).length;
  $("labKpis").innerHTML = [
    { t: "Em aberto", v: kAberto }, { t: "No laboratório", v: kLab },
    { t: "Atrasadas", v: kAtraso, late: true }, { t: "Entregues no mês", v: kEntreg, accent: true }
  ].map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v" style="${k.late && k.v > 0 ? "color:var(--stop)" : ""}">${num(k.v)}</div></div>`).join("");

  $("kanban").innerHTML = OS_STATUS.map((st) => {
    const items = osList.filter((o) => o.status === st.k).sort((a, b) => (a.datas.previsao || "").localeCompare(b.datas.previsao || ""));
    const cards = items.map((o) => {
      const late = osAtrasada(o), adv = proximoStatus(o.status);
      return `<div class="osCard" data-os="${esc(o.id)}">
        <div class="osNum">${esc(osNumero(o.numero))}</div>
        <div class="osCli">${esc(o.clienteNome || "Cliente")}</div>
        <div class="osRx">${esc(rxResumo(o.receita))}</div>
        <div class="osMeta"><span>${esc(o.lente ? o.lente.tipo : "—")}${o.lente && o.lente.material ? " · " + esc(o.lente.material) : ""}</span>${o.laboratorio ? `<span>🔬 ${esc(o.laboratorio)}</span>` : ""}</div>
        <div class="osFoot"><span class="prev${late ? " late" : ""}">${late ? "⚠ " : "📅 "}${esc(fmtData(o.datas.previsao))}${o.valores.saldo > 0 ? " · saldo " + money(o.valores.saldo) : ""}</span>
        ${adv ? `<button class="adv" data-adv="${esc(o.id)}" title="Avançar para ${esc(statusInfo(adv).n)}">→</button>` : `<span class="tag go">✓</span>`}</div></div>`;
    }).join("");
    return `<div class="kanCol"><div class="colHead"><span class="dot" style="background:${st.cor}"></span><span class="cn">${esc(st.n)}</span><span class="cc">${items.length}</span></div>
      ${cards || '<div class="hint" style="padding:6px 2px">—</div>'}</div>`;
  }).join("");
}

function fillSelectsBase() {
  $("os_lente_tipo").innerHTML = options(TIPOS_LENTE_OS);
  $("os_lente_mat").innerHTML = options(MATERIAIS);
  $("os_status").innerHTML = OS_STATUS.map((x) => `<option value="${x.k}">${esc(x.n)}</option>`).join("");
}
function fillRx(rx) {
  ["od", "oe"].forEach((eye) => ["esf", "cil", "eixo", "dnp", "add", "alt"].forEach((f) => {
    const el = $("rx_" + eye + "_" + f); if (!el) return;
    const v = rx && rx[eye] ? rx[eye][f] : ""; el.value = (v === 0 || v) ? String(v).replace(".", ",") : "";
  }));
  $("os_medico").value = (rx && rx.medico) || ""; $("os_cro").value = (rx && rx.cro) || ""; $("os_dataRx").value = (rx && rx.dataRx) || "";
}
function readRx() {
  const g = (id) => { const v = $(id).value.trim(); return v === "" ? "" : brNum(v); };
  const ax = (id) => { const v = $(id).value.trim(); return v === "" ? "" : (parseInt(v, 10) || 0); };
  const eye = (p) => ({ esf: g("rx_" + p + "_esf"), cil: g("rx_" + p + "_cil"), eixo: ax("rx_" + p + "_eixo"), dnp: g("rx_" + p + "_dnp"), add: g("rx_" + p + "_add"), alt: g("rx_" + p + "_alt") });
  return { od: eye("od"), oe: eye("oe"), medico: $("os_medico").value.trim(), cro: $("os_cro").value.trim(), dataRx: $("os_dataRx").value };
}
function renderTratChips(sel) { const s = sel || []; $("os_trat").innerHTML = TRAT_LENTE.map((t) => `<div class="chip${s.includes(t) ? " on" : ""}" data-trat="${esc(t)}">${esc(t)}</div>`).join(""); }
function readTrat() { return [...$("os_trat").querySelectorAll(".chip.on")].map((c) => c.dataset.trat); }
function updateTotals() { const a = brNum($("os_v_arm").value), l = brNum($("os_v_lente").value), s = brNum($("os_v_sinal").value); $("os_v_total").value = money(a + l); $("os_v_saldo").value = money(Math.max(0, (a + l) - s)); }

function fillSellers() { $("os_seller").innerHTML = sellers.filter((s) => s.ativo).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join(""); }
function fillLabs() { $("labList").innerHTML = (labs || []).map((l) => `<option value="${esc(l)}">`).join(""); }

function abrirOS(id, pre) {
  osEditId = id || null;
  const o = id ? osList.find((x) => x.id === id) : null;
  fillSellers(); fillLabs();
  const set = (k, v) => { const el = $(k); if (el) el.value = v == null ? "" : v; };
  if (o) {
    $("osTitle").textContent = "Editar " + osNumero(o.numero);
    set("os_id", o.id); set("os_cli", o.clienteNome); set("os_tel", o.clienteTel);
    $("os_seller").value = o.sellerId || ""; fillRx(o.receita);
    set("os_arm_modelo", o.armacao.modelo); set("os_arm_cor", o.armacao.cor); $("os_arm_origem").value = o.armacao.origem || "loja";
    set("os_arm_aro", o.armacao.aro); set("os_arm_ponte", o.armacao.ponte); set("os_arm_haste", o.armacao.haste);
    $("os_lente_tipo").value = o.lente.tipo || TIPOS_LENTE_OS[0]; $("os_lente_mat").value = o.lente.material || MATERIAIS[0];
    renderTratChips(o.lente.tratamentos); set("os_lente_marca", o.lente.marca); set("os_lab", o.laboratorio);
    set("os_v_arm", o.valores.armacao ? String(o.valores.armacao).replace(".", ",") : "");
    set("os_v_lente", o.valores.lente ? String(o.valores.lente).replace(".", ",") : "");
    set("os_v_sinal", o.valores.sinal ? String(o.valores.sinal).replace(".", ",") : "");
    set("os_prev", o.datas.previsao); $("os_status").value = o.status; $("os_statusWrap").style.display = "flex";
    set("os_obs", o.obs);
    $("btnDeleteOS").style.display = PODE_APAGAR ? "inline-flex" : "none";
  } else {
    $("osTitle").textContent = "Nova OS de laboratório";
    ["os_id", "os_cli", "os_tel", "os_arm_modelo", "os_arm_cor", "os_arm_aro", "os_arm_ponte", "os_arm_haste", "os_lente_marca", "os_lab", "os_v_arm", "os_v_lente", "os_v_sinal", "os_obs"].forEach((x) => set(x, ""));
    fillRx(null); $("os_arm_origem").value = "loja"; $("os_lente_tipo").value = TIPOS_LENTE_OS[0]; $("os_lente_mat").value = "1.67";
    renderTratChips(["Antirreflexo"]); $("os_statusWrap").style.display = "none"; $("btnDeleteOS").style.display = "none";
    const d = new Date(); d.setDate(d.getDate() + 5); set("os_prev", dateKey(d));
    if (pre) { set("os_cli", pre.cli || ""); if (pre.sellerId) $("os_seller").value = pre.sellerId; if (pre.vLente) set("os_v_lente", String(pre.vLente).replace(".", ",")); if (pre.tipoLente && TIPOS_LENTE_OS.includes(pre.tipoLente)) $("os_lente_tipo").value = pre.tipoLente; }
  }
  updateTotals(); openModal("osBack");
}
async function salvarOS() {
  const cli = $("os_cli").value.trim(); if (!cli) { toast("Informe o cliente."); return; }
  const a = brNum($("os_v_arm").value), l = brNum($("os_v_lente").value), s = brNum($("os_v_sinal").value);
  const dados = {
    clienteNome: cli, clienteTel: $("os_tel").value.trim(), sellerId: $("os_seller").value,
    receita: readRx(),
    armacao: { origem: $("os_arm_origem").value, modelo: $("os_arm_modelo").value.trim(), cor: $("os_arm_cor").value.trim(), aro: $("os_arm_aro").value.trim(), ponte: $("os_arm_ponte").value.trim(), haste: $("os_arm_haste").value.trim() },
    lente: { tipo: $("os_lente_tipo").value, material: $("os_lente_mat").value, tratamentos: readTrat(), marca: $("os_lente_marca").value.trim() },
    laboratorio: $("os_lab").value.trim(), obs: $("os_obs").value.trim(),
    valores: { armacao: a, lente: l, total: a + l, sinal: s, saldo: Math.max(0, (a + l) - s) },
    atualizadoEm: Date.now()
  };
  let o;
  if (osEditId) {
    o = osList.find((x) => x.id === osEditId) || { id: osEditId };
    o = { ...o, ...dados, status: $("os_status").value, datas: { ...(o.datas || {}), previsao: $("os_prev").value } };
    if (o.status === "entregue" && !(o.datas && o.datas.entrega)) o.datas = { ...(o.datas || {}), entrega: dateKey() };
  } else {
    const numero = (osList.reduce((m, x) => Math.max(m, x.numero || 0), 0)) + 1;
    o = { id: "os_" + uid(), numero, status: "aberta", datas: { entrada: dateKey(), previsao: $("os_prev").value, entrega: "" }, criadoEm: Date.now(), ...dados };
  }
  try { await saveOS(STORE, o); } catch (e) { toast("Falha ao salvar a OS."); return; }
  closeModal("osBack"); toast("OS salva ✓");
}
async function removerOS() { if (!osEditId) return; if (!confirm("Excluir esta OS?")) return; try { await deleteOS(STORE, osEditId); } catch (e) { toast("Falha ao excluir."); return; } closeModal("osBack"); toast("OS excluída."); }
async function avancarOS(id) {
  const o = osList.find((x) => x.id === id); if (!o) return;
  const nx = proximoStatus(o.status); if (!nx) return;
  const upd = { ...o, status: nx, atualizadoEm: Date.now() };
  if (nx === "entregue") upd.datas = { ...o.datas, entrega: dateKey() };
  try { await saveOS(STORE, upd); toast(osNumero(o.numero) + " → " + statusInfo(nx).n); } catch (e) { toast("Falha ao atualizar."); }
}
function checkPrefill() {
  const raw = sessionStorage.getItem("omnia_os_prefill");
  if (!raw) return;
  sessionStorage.removeItem("omnia_os_prefill");
  try { abrirOS(null, JSON.parse(raw)); } catch (_) {}
}

function wireEvents() {
  $("btnNovaOS").addEventListener("click", () => abrirOS(null));
  $("kanban").addEventListener("click", (e) => {
    const adv = e.target.closest("[data-adv]"); if (adv) { e.stopPropagation(); avancarOS(adv.dataset.adv); return; }
    const card = e.target.closest("[data-os]"); if (card) abrirOS(card.dataset.os);
  });
  $("btnSaveOS").addEventListener("click", salvarOS);
  $("btnDeleteOS").addEventListener("click", removerOS);
  $("os_trat").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) c.classList.toggle("on"); });
  ["os_v_arm", "os_v_lente", "os_v_sinal"].forEach((id) => $(id).addEventListener("input", updateTotals));
}
