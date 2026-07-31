import { initShell } from "./session.js";
import { subscribeState, getFaixas, saveFaixas } from "./db.js";
import { $, esc, money, brNum, toast } from "./utils.js";

const DEFAULT_FAIXAS = [
  { de: 0, ate: 79, pct: 0 }, { de: 80, ate: 99, pct: 2 },
  { de: 100, ate: 119, pct: 3.5 }, { de: 120, ate: 9999, pct: 5 }
];

let CTX, STORE, sellers = [], metaMes = {}, faixas = DEFAULT_FAIXAS.slice();

init();
async function init() {
  CTX = await initShell("comissao");
  STORE = CTX.storeId;
  wireEvents();
  const f = await getFaixas(STORE); if (f && f.length) faixas = f;
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; metaMes = (st && st.metaMes) || {}; reveal(); render(); });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }
function monthKeyNow() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function metaConsultor() { const m = Number(metaMes[monthKeyNow()] || 0); const n = sellers.filter((s) => s.ativo).length || 1; return m / n; }

function render() {
  $("simSeller").innerHTML = sellers.filter((s) => s.ativo).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");
  renderFaixas();
  $("simMetaInfo").innerHTML = `Meta individual do mês: <b>${money(metaConsultor())}</b> (meta da ótica ÷ consultores ativos).`;
}
function renderFaixas() {
  $("faixasBox").innerHTML = faixas.map((f, i) => `<div class="faixaRow">
    <input data-fx="${i}" data-k="de" inputmode="numeric" value="${f.de}"/>
    <input data-fx="${i}" data-k="ate" inputmode="numeric" value="${f.ate}"/>
    <input data-fx="${i}" data-k="pct" inputmode="decimal" value="${String(f.pct).replace(".", ",")}"/>
    <button class="btn ghost icon" data-fxdel="${i}" title="Remover">✕</button></div>`).join("");
}
function lerFaixas() {
  const arr = [];
  $("faixasBox").querySelectorAll(".faixaRow").forEach((row) => {
    arr.push({ de: parseFloat(row.querySelector('[data-k="de"]').value) || 0, ate: parseFloat(row.querySelector('[data-k="ate"]').value) || 0, pct: brNum(row.querySelector('[data-k="pct"]').value) });
  });
  return arr;
}
function simular() {
  const venda = brNum($("simVenda").value), meta = metaConsultor();
  const ating = meta > 0 ? venda / meta * 100 : 0;
  const faixa = faixas.find((f) => ating >= f.de && ating <= f.ate) || { pct: 0 };
  const com = venda * (faixa.pct / 100);
  $("simResultado").innerHTML = `<div class="simRes">
    <div class="frase">Vendendo ${money(venda)} (${ating.toFixed(0)}% da meta), a comissão fica</div>
    <div class="big">${money(com)}</div>
    <div class="det">Faixa aplicada: ${String(faixa.pct).replace(".", ",")}% · atingimento ${ating.toFixed(0)}%</div></div>`;
}
function wireEvents() {
  $("btnSimular").addEventListener("click", simular);
  $("btnAddFaixa").addEventListener("click", () => { faixas.push({ de: 0, ate: 0, pct: 0 }); renderFaixas(); });
  $("faixasBox").addEventListener("click", (e) => { const b = e.target.closest("[data-fxdel]"); if (b) { faixas.splice(+b.dataset.fxdel, 1); renderFaixas(); } });
  $("btnSaveFaixas").addEventListener("click", async () => {
    faixas = lerFaixas().sort((a, b) => a.de - b.de); renderFaixas();
    try { await saveFaixas(STORE, faixas); toast("Faixas salvas ✓"); } catch (e) { toast("Falha ao salvar."); }
  });
}
