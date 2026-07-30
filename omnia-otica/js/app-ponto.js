import { initShell } from "./session.js";
import { subscribeState, subscribePonto, savePonto } from "./db.js";
import { $, esc, dateKey, toast } from "./utils.js";

let CTX, STORE, sellers = [], pontos = [];

init();
async function init() {
  CTX = await initShell("ponto");
  STORE = CTX.storeId;
  $("pontoHoje").textContent = new Date().toLocaleDateString("pt-BR");
  wireEvents();
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; fillSel(); reveal(); render(); });
  subscribePonto(STORE, (list) => { pontos = list; reveal(); render(); });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }
function fillSel() {
  const cur = $("pontoSel").value;
  $("pontoSel").innerHTML = sellers.filter((s) => s.ativo).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");
  if (cur) $("pontoSel").value = cur;
}
function render() {
  const hoje = dateKey(), regs = pontos.filter((p) => p.data === hoje);
  const box = $("pontoTable");
  if (!regs.length) { box.innerHTML = `<div class="hint">Nenhum ponto registrado hoje.</div>`; return; }
  const mins = (hm) => { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const dur = (p) => { const e = mins(p.marc.entrada), i = mins(p.marc.intervalo), r = mins(p.marc.retorno), s = mins(p.marc.saida);
    if (e == null || s == null) return "—"; let t = s - e; if (i != null && r != null) t -= (r - i); if (t < 0) return "—";
    return String(Math.floor(t / 60)).padStart(2, "0") + "h" + String(t % 60).padStart(2, "0"); };
  box.innerHTML = `<table><thead><tr><th>Colaborador</th><th>Entrada</th><th>Intervalo</th><th>Retorno</th><th>Saída</th><th class="num">Horas</th></tr></thead><tbody>
    ${regs.map((p) => `<tr><td>${esc(p.nome)}</td><td class="mono">${p.marc.entrada || "—"}</td><td class="mono">${p.marc.intervalo || "—"}</td><td class="mono">${p.marc.retorno || "—"}</td><td class="mono">${p.marc.saida || "—"}</td><td class="num">${dur(p)}</td></tr>`).join("")}</tbody></table>`;
}
async function bater(tipo) {
  const id = $("pontoSel").value, s = sellers.find((x) => x.id === id);
  if (!s) { toast("Selecione o colaborador."); return; }
  const hoje = dateKey();
  let p = pontos.find((x) => x.sellerId === id && x.data === hoje);
  if (!p) p = { id: id + "_" + hoje, sellerId: id, nome: s.nome, data: hoje, marc: { entrada: "", intervalo: "", retorno: "", saida: "" } };
  if (p.marc[tipo]) { toast("Essa marcação já foi registrada hoje."); return; }
  const now = new Date();
  p.marc = { ...p.marc, [tipo]: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") };
  try { await savePonto(STORE, p); toast(({ entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída" })[tipo] + " às " + p.marc[tipo] + " ✓"); }
  catch (e) { toast("Falha ao registrar."); }
}
function wireEvents() {
  document.querySelector(".pontoBtns").addEventListener("click", (e) => { const b = e.target.closest("[data-ponto]"); if (b) bater(b.dataset.ponto); });
}
