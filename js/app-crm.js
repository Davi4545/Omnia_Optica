import { initShell } from "./session.js";
import { subscribeState, subscribeClientes, saveCliente, deleteCliente } from "./db.js";
import { $, esc, uid, money, num, dateKey, fmtData, toast, openModal, closeModal,
  wireModals, waLink, primeiroNome, brNum, comprimirDocumento, abrirImagem, tamanhoLegivel } from "./utils.js";
import { fmtGrau } from "./domain.js";

let CTX, STORE, STORE_NAME, PODE_APAGAR = false;
let sellers = [], clientes = [], busca = "";
let rxFotoTemp = "";

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

// Resumo da receita mais recente, direto na lista — evita abrir o cadastro
// só para conferir o grau.
function rxResumoLinha(c) {
  const rs = (c.receitas || []);
  if (!rs.length) return '<span class="tiny" style="color:var(--ink-faint)">—</span>';
  const r = rs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const olho = (e) => {
    if (!e) return "";
    let t = fmtGrau(e.esf) || "0,00";
    if (e.cil && Number(e.cil) !== 0) t += " " + fmtGrau(e.cil);
    return t;
  };
  const quando = r.ts ? new Date(r.ts).toLocaleDateString("pt-BR", { month: "2-digit", year: "2-digit" }) : "";
  return `<div class="rxCel"><span class="g">${esc(olho(r.od))} / ${esc(olho(r.oe))}</span>
    <span class="d">${esc(quando)}${rs.length > 1 ? " · " + rs.length + " receitas" : ""}</span></div>`;
}

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
  box.innerHTML = `<table><thead><tr><th>Cliente</th><th>Etapa</th><th>Receita</th><th class="num">Total</th><th>Próx. retorno</th><th>Consultor</th><th></th></tr></thead><tbody>
    ${list.map((c) => { const late = retornoPendente(c), an = aniversarioHoje(c);
      return `<tr class="clickRow" data-cli="${esc(c.id)}">
        <td><b>${esc(c.nome)}</b>${an ? " 🎂" : ""}<div class="tiny" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(c.telefone || "—")}</div></td>
        <td><span class="etapa ${esc(c.etapa)}">${c.etapa === "fechado" ? "Cliente" : c.etapa === "negociacao" ? "Negociação" : "Lead"}</span></td>
        <td>${rxResumoLinha(c)}</td>
        <td class="num">${money(totalGasto(c))}</td>
        <td class="${late ? "late" : ""}">${c.proximoRetorno ? fmtData(c.proximoRetorno) : "—"}${late ? " ⚠" : ""}</td>
        <td>${esc(c.ownerNome || "—")}</td>
        <td><div class="rowActs">
          <button class="btn wa sm" data-wa="${esc(c.id)}">WhatsApp</button>
          ${PODE_APAGAR ? `<button class="btn ghost sm icon danger" data-del="${esc(c.id)}" title="Excluir cliente" aria-label="Excluir ${esc(c.nome)}">🗑</button>` : ""}
        </div></td></tr>`;
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
  // sempre abre na aba Dados
  document.querySelectorAll("[data-cliaba]").forEach((x) => x.classList.toggle("active", x.dataset.cliaba === "dados"));
  $("cliAbaDados").style.display = "block";
  $("cliAbaReceitas").style.display = "none";
  fecharFormRx();
  $("rxCount").textContent = c ? ((c.receitas || []).length) : 0;
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
// Exclusão a partir da lista. O aviso menciona o histórico porque as vendas
// ficam em "records" e continuam lá — some o cadastro, não o faturamento.
async function excluirDaLista(id) {
  const c = clientes.find((x) => x.id === id); if (!c) return;
  const n = (c.compras || []).length;
  const aviso = n
    ? `Excluir ${c.nome}?\n\n${n} compra(s) registrada(s) somem do cadastro dele. As vendas continuam nos relatórios.`
    : `Excluir ${c.nome}?`;
  if (!confirm(aviso)) return;
  try { await deleteCliente(STORE, id); toast("Cliente excluído."); }
  catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sem permissão para excluir." : "Falha ao excluir.");
  }
}

async function remover() { const id = $("cli_id").value; if (!id) return; if (!confirm("Excluir este cliente?")) return; try { await deleteCliente(STORE, id); } catch (e) { toast("Falha ao excluir."); return; } closeModal("cliBack"); toast("Cliente excluído."); }
function wa(id) { const c = clientes.find((x) => x.id === id); if (!c) return; window.open(waLink(c.telefone, `Olá ${primeiroNome(c.nome)}! Aqui é da ${STORE_NAME}. Tudo bem?`), "_blank"); }

/* ================= RECEITAS DO CLIENTE ================= */
function receitasDe(id) {
  const c = clientes.find((x) => x.id === id);
  return ((c && c.receitas) || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function linhaOlho(rot, e) {
  if (!e) return "";
  const v = (x) => (x === "" || x == null) ? "—" : x;
  return `<tr><td class="ol">${rot}</td>
    <td>${esc(fmtGrau(e.esf) || "—")}</td><td>${esc(fmtGrau(e.cil) || "—")}</td>
    <td>${esc(e.eixo === "" || e.eixo == null ? "—" : e.eixo + "°")}</td>
    <td>${esc(v(e.dnp))}</td><td>${esc(fmtGrau(e.add) || "—")}</td></tr>`;
}
function renderReceitas() {
  const id = $("cli_id").value;
  const lista = receitasDe(id);
  $("rxCount").textContent = lista.length;
  const box = $("rxLista");
  if (!id) { box.innerHTML = `<div class="hint">Salve o cliente primeiro para registrar receitas.</div>`; return; }
  if (!lista.length) {
    box.innerHTML = `<div class="empty" style="padding:26px 16px"><div class="glyph">📋</div>
      <div class="t">Nenhuma receita registrada</div>
      <div class="d">As receitas lançadas na venda aparecem aqui automaticamente.</div></div>`;
    return;
  }
  box.innerHTML = lista.map((r, i) => {
    const atual = i === 0;
    return `<div class="rxCard${atual ? " atual" : ""}">
      <div class="rxHead">
        <div><b>${esc(fmtData(r.data) !== "—" ? new Date(r.ts || Date.now()).toLocaleDateString("pt-BR") : "—")}</b>
          ${atual ? '<span class="tag go">atual</span>' : ""}
          ${r.origem === "venda" ? '<span class="tag">da venda</span>' : ""}</div>
        <div class="rxActs">
          ${r.foto ? `<button class="btn ghost sm" data-rxver="${esc(r.id)}">Ver receita</button>` : ""}
          ${PODE_APAGAR ? `<button class="btn ghost sm icon danger" data-rxdel="${esc(r.id)}" title="Excluir receita">🗑</button>` : ""}
        </div>
      </div>
      <table class="rxView"><thead><tr><th></th><th>Esf</th><th>Cil</th><th>Eixo</th><th>DNP</th><th>Adição</th></tr></thead>
        <tbody>${linhaOlho("OD", r.od)}${linhaOlho("OE", r.oe)}</tbody></table>
      ${(r.medico || r.cro) ? `<div class="rxMed">${esc(r.medico || "")}${r.cro ? " · " + esc(r.cro) : ""}</div>` : ""}
      ${r.fotoRemovida ? `<div class="tiny" style="text-transform:none;letter-spacing:0;color:var(--ink-faint)">foto removida para poupar espaço</div>` : ""}
    </div>`;
  }).join("");
}
function abrirFormRx() {
  ["nrx_od_esf","nrx_od_cil","nrx_od_eixo","nrx_od_dnp","nrx_od_add",
   "nrx_oe_esf","nrx_oe_cil","nrx_oe_eixo","nrx_oe_dnp","nrx_oe_add",
   "nrx_medico","nrx_cro"].forEach((k) => { const el = $(k); if (el) el.value = ""; });
  $("nrx_data").value = dateKey();
  rxFotoTemp = "";
  $("nrx_fotoPrev").style.display = "none";
  $("nrx_fotoBtn").style.display = "flex";
  $("nrx_foto").value = "";
  $("rxForm").style.display = "block";
  $("btnNovaRx").style.display = "none";
}
function fecharFormRx() { $("rxForm").style.display = "none"; $("btnNovaRx").style.display = "inline-flex"; }
function lerNovaRx() {
  const g = (k) => { const v = $(k).value.trim(); return v === "" ? "" : brNum(v); };
  const ax = (k) => { const v = $(k).value.trim(); return v === "" ? "" : (parseInt(v, 10) || 0); };
  const olho = (p) => ({ esf: g(`nrx_${p}_esf`), cil: g(`nrx_${p}_cil`), eixo: ax(`nrx_${p}_eixo`),
                         dnp: g(`nrx_${p}_dnp`), add: g(`nrx_${p}_add`), alt: "" });
  return { od: olho("od"), oe: olho("oe"), medico: $("nrx_medico").value.trim(), cro: $("nrx_cro").value.trim() };
}
async function salvarNovaRx() {
  const id = $("cli_id").value;
  const c = clientes.find((x) => x.id === id);
  if (!c) { toast("Salve o cliente antes de registrar a receita."); return; }
  const rx = lerNovaRx();
  const vazia = ["od","oe"].every((e) => ["esf","cil","eixo","dnp","add"].every((k) => rx[e][k] === ""));
  if (vazia && !rxFotoTemp) { toast("Preencha ao menos um grau ou anexe a foto."); return; }

  const nova = { id: "rx_" + uid(), data: $("nrx_data").value || dateKey(),
    ts: new Date(($("nrx_data").value || dateKey()) + "T12:00:00").getTime(),
    od: rx.od, oe: rx.oe, medico: rx.medico, cro: rx.cro, foto: rxFotoTemp, origem: "manual" };

  const atualizado = { ...c, receitas: [...(c.receitas || []), nova], atualizadoEm: Date.now() };
  if (atualizado.receitas.length > 12) atualizado.receitas = atualizado.receitas.slice(-12);
  try {
    await saveCliente(STORE, atualizado);
    Object.assign(c, atualizado);
    fecharFormRx(); renderReceitas(); toast("Receita registrada ✓");
  } catch (e) { console.error(e); toast("Falha ao salvar a receita."); }
}
async function excluirRx(rxId) {
  const c = clientes.find((x) => x.id === $("cli_id").value); if (!c) return;
  if (!confirm("Excluir esta receita do histórico?")) return;
  const atualizado = { ...c, receitas: (c.receitas || []).filter((r) => r.id !== rxId), atualizadoEm: Date.now() };
  try { await saveCliente(STORE, atualizado); Object.assign(c, atualizado); renderReceitas(); toast("Receita excluída."); }
  catch (e) { toast("Falha ao excluir."); }
}

function wireEvents() {
  $("btnNovoCliente").addEventListener("click", () => abrir(null));
  $("cliSearch").addEventListener("input", (e) => { busca = e.target.value; render(); });
  $("cliTable").addEventListener("click", (e) => {
    const d = e.target.closest("[data-del]"); if (d) { e.stopPropagation(); excluirDaLista(d.dataset.del); return; }
    const w = e.target.closest("[data-wa]"); if (w) { e.stopPropagation(); wa(w.dataset.wa); return; }
    const row = e.target.closest("[data-cli]"); if (row) abrir(row.dataset.cli);
  });
  // abas do modal de cliente
  document.querySelectorAll("[data-cliaba]").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll("[data-cliaba]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const rec = t.dataset.cliaba === "receitas";
    $("cliAbaDados").style.display = rec ? "none" : "block";
    $("cliAbaReceitas").style.display = rec ? "block" : "none";
    if (rec) renderReceitas();
  }));
  $("btnNovaRx").addEventListener("click", abrirFormRx);
  $("btnCancelarRx").addEventListener("click", fecharFormRx);
  $("btnSalvarRx").addEventListener("click", salvarNovaRx);
  $("rxLista").addEventListener("click", (e) => {
    const v = e.target.closest("[data-rxver]");
    if (v) { const r = receitasDe($("cli_id").value).find((x) => x.id === v.dataset.rxver); if (r && r.foto) abrirImagem(r.foto); return; }
    const d = e.target.closest("[data-rxdel]"); if (d) excluirRx(d.dataset.rxdel);
  });
  $("nrx_foto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      toast("Preparando a foto…");
      const r = await comprimirDocumento(f);
      rxFotoTemp = r.dataUrl;
      $("nrx_fotoImg").src = r.dataUrl;
      $("nrx_fotoInfo").textContent = `${r.largura}×${r.altura} · ${tamanhoLegivel(r.bytes)}`;
      $("nrx_fotoPrev").style.display = "flex";
      $("nrx_fotoBtn").style.display = "none";
    } catch (err) { toast("Não foi possível ler a imagem."); e.target.value = ""; }
  });
  $("nrx_fotoVer").addEventListener("click", () => { if (rxFotoTemp) abrirImagem(rxFotoTemp); });
  $("nrx_fotoDel").addEventListener("click", () => {
    rxFotoTemp = ""; $("nrx_fotoPrev").style.display = "none";
    $("nrx_fotoBtn").style.display = "flex"; $("nrx_foto").value = "";
  });

  $("btnSaveCli").addEventListener("click", salvar);
  $("btnDeleteCli").addEventListener("click", remover);
  $("btnWaCli").addEventListener("click", () => { const id = $("cli_id").value; if (id) wa(id); else window.open(waLink($("cli_tel").value, `Olá ${primeiroNome($("cli_nome").value)}! Aqui é da ${STORE_NAME}.`), "_blank"); });
}
