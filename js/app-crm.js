import { initShell } from "./session.js";
import { subscribeState, subscribeClientes, saveCliente, deleteCliente } from "./db.js";
import { $, esc, uid, money, num, dateKey, fmtData, toast, openModal, closeModal, wireModals, waLink, primeiroNome } from "./utils.js";

let CTX, STORE, STORE_NAME, PODE_APAGAR = false;
let sellers = [], clientes = [], busca = "";

init();
async function init() {
  CTX = await initShell("clientes");
  STORE = CTX.storeId; STORE_NAME = (CTX.store && CTX.store.name) || "Ótica";
  // As regras só permitem gestor excluir cliente — escondemos para evitar falha silenciosa.
  PODE_APAGAR = !!CTX.isAdmin;
  wireModals(); wireEvents();
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; });
  subscribeClientes(STORE, (list) => {
    // documento incompleto não pode derrubar a tela
    clientes = list.map((c) => ({ ...c, nome: c.nome || "(sem nome)", compras: c.compras || [], etapa: c.etapa || "lead" }));
    reveal();
    try { render(); } catch (e) { console.error("render CRM", e); }
  });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }

const totalGasto = (c) => (c.compras || []).reduce((s, x) => s + Number(x.valor || 0), 0);
function aniversarioHoje(c) { if (!c.nascimento) return false; const p = c.nascimento.split("-"); const d = new Date(); return p.length === 3 && +p[1] === d.getMonth() + 1 && +p[2] === d.getDate(); }
const retornoPendente = (c) => c.proximoRetorno && c.proximoRetorno <= dateKey();

function render() {
  const cs = clientes;
  const aniv = cs.filter(aniversarioHoje).length, ret = cs.filter(retornoPendente).length, neg = cs.filter((c) => c.etapa === "negociacao" || c.etapa === "lead").length;
  $("cliKpis").innerHTML = [
    { t: "Clientes", v: num(cs.length) }, { t: "Aniversariantes hoje", v: num(aniv), accent: aniv > 0 },
    { t: "Retornos pendentes", v: num(ret), late: ret > 0 }, { t: "Em prospecção", v: num(neg) }
  ].map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v" style="${k.late ? "color:var(--stop)" : ""}">${k.v}</div></div>`).join("");
  const term = busca.trim().toLowerCase();
  let list = cs.slice().sort((a, b) => (b.ultimaCompraTs || 0) - (a.ultimaCompraTs || 0));
  if (term) list = list.filter((c) => c.nome.toLowerCase().includes(term) || (c.telefone || "").toLowerCase().includes(term));
  const box = $("cliTable");
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="glyph">🙂</div><div class="t">Nenhum cliente</div><div class="d">Cadastre clientes ou finalize vendas com nome para popular o CRM.</div></div>`; return; }
  box.innerHTML = `<table><thead><tr><th>Cliente</th><th>Etapa</th><th class="num">Total</th><th>Próx. retorno</th><th>Consultor</th><th></th></tr></thead><tbody>
    ${list.map((c) => { const late = retornoPendente(c), an = aniversarioHoje(c);
      return `<tr class="clickRow" data-cli="${esc(c.id)}">
        <td><b>${esc(c.nome)}</b>${an ? " 🎂" : ""}<div class="tiny" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(c.telefone || "—")}</div></td>
        <td><span class="etapa ${esc(c.etapa)}">${c.etapa === "fechado" ? "Cliente" : c.etapa === "negociacao" ? "Negociação" : "Lead"}</span></td>
        <td class="num">${money(totalGasto(c))}</td>
        <td class="${late ? "late" : ""}">${c.proximoRetorno ? fmtData(c.proximoRetorno) : "—"}${late ? " ⚠" : ""}</td>
        <td>${esc(c.ownerNome || "—")}</td>
        <td><button class="btn wa sm" data-wa="${esc(c.id)}">WhatsApp</button></td></tr>`;
    }).join("")}</tbody></table>`;
}

function abrir(id) {
  const c = id ? clientes.find((x) => x.id === id) : null;
  $("cli_owner").innerHTML = `<option value="">—</option>` + sellers.filter((s) => s.ativo).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");
  const set = (k, v) => { const el = $(k); if (el) el.value = v == null ? "" : v; };
  if (c) {
    $("cliTitle").textContent = "Editar cliente";
    set("cli_id", c.id); set("cli_nome", c.nome); set("cli_tel", c.telefone); set("cli_nasc", c.nascimento);
    $("cli_etapa").value = c.etapa || "lead"; set("cli_prox", c.proximoRetorno); $("cli_owner").value = c.ownerId || ""; set("cli_obs", c.obs);
    const nc = (c.compras || []).length;
    $("cli_hist").innerHTML = nc ? `<b>${nc}</b> compra(s) · total <b>${money(totalGasto(c))}</b>${c.ultimaCompraTs ? ` · última em ${new Date(c.ultimaCompraTs).toLocaleDateString("pt-BR")}` : ""}` : "Sem compras registradas.";
    $("btnDeleteCli").style.display = PODE_APAGAR ? "inline-flex" : "none";
  } else {
    $("cliTitle").textContent = "Novo cliente";
    ["cli_id", "cli_nome", "cli_tel", "cli_nasc", "cli_prox", "cli_obs"].forEach((k) => set(k, ""));
    $("cli_etapa").value = "lead"; $("cli_owner").value = ""; $("cli_hist").innerHTML = "";
    $("btnDeleteCli").style.display = "none";
  }
  openModal("cliBack");
}
async function salvar() {
  const nome = $("cli_nome").value.trim(); if (!nome) { toast("Digite o nome."); return; }
  const id = $("cli_id").value, owner = $("cli_owner").value;
  const dados = { nome, telefone: $("cli_tel").value.trim(), nascimento: $("cli_nasc").value, etapa: $("cli_etapa").value, proximoRetorno: $("cli_prox").value, obs: $("cli_obs").value.trim(), ownerId: owner, ownerNome: (sellers.find((s) => s.id === owner) || {}).nome || "", atualizadoEm: Date.now() };
  let c;
  if (id) { c = clientes.find((x) => x.id === id) || { id }; c = { ...c, ...dados }; }
  else c = Object.assign({ id: "cli_" + uid(), compras: [], ultimaCompraTs: 0, criadoEm: Date.now() }, dados);
  try { await saveCliente(STORE, c); } catch (e) { toast("Falha ao salvar."); return; }
  closeModal("cliBack"); toast("Cliente salvo ✓");
}
async function remover() { const id = $("cli_id").value; if (!id) return; if (!confirm("Excluir este cliente?")) return; try { await deleteCliente(STORE, id); } catch (e) { toast("Falha ao excluir."); return; } closeModal("cliBack"); toast("Cliente excluído."); }
function wa(id) { const c = clientes.find((x) => x.id === id); if (!c) return; window.open(waLink(c.telefone, `Olá ${primeiroNome(c.nome)}! Aqui é da ${STORE_NAME}. Tudo bem?`), "_blank"); }

function wireEvents() {
  $("btnNovoCliente").addEventListener("click", () => abrir(null));
  $("cliSearch").addEventListener("input", (e) => { busca = e.target.value; render(); });
  $("cliTable").addEventListener("click", (e) => {
    const w = e.target.closest("[data-wa]"); if (w) { e.stopPropagation(); wa(w.dataset.wa); return; }
    const row = e.target.closest("[data-cli]"); if (row) abrir(row.dataset.cli);
  });
  $("btnSaveCli").addEventListener("click", salvar);
  $("btnDeleteCli").addEventListener("click", remover);
  $("btnWaCli").addEventListener("click", () => { const id = $("cli_id").value; if (id) wa(id); else window.open(waLink($("cli_tel").value, `Olá ${primeiroNome($("cli_nome").value)}! Aqui é da ${STORE_NAME}.`), "_blank"); });
}
