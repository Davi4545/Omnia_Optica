import { initShell } from "./session.js";
import {
  subscribeState, saveState, subscribeRecords, addRecord,
  subscribeClientes, saveCliente
} from "./db.js";
import {
  $, esc, uid, money, num, dateKey, monthKey, hhmm, clamp, brNum,
  comprimirImagem, comprimirDocumento, abrirImagem, tamanhoLegivel,
  toast, openModal, closeModal, wireModals, downloadBlob
} from "./utils.js";
import { PRODUTOS, TIPOS_LENTE, TRATAMENTOS, MOTIVOS_NAO, GENEROS, SELOS, agg, options } from "./domain.js";

let CTX, STORE;
let state = { config: {}, sellers: [], fila: [], fora: [], foco: [], metaMes: {} };
let records = [];
let clientes = [];
let aplicandoRemoto = false;

init();
async function init() {
  CTX = await initShell("ops");
  STORE = CTX.storeId;
  wireModals();
  wireEvents();
  subscribeState(STORE, (remote) => {
    if (remote) {
      aplicandoRemoto = true;
      state = normaliza(remote);
      aplicandoRemoto = false;
    }
    reveal();
    render();
  });
  subscribeRecords(STORE, (list) => { records = list; render(); });
  subscribeClientes(STORE, (list) => { clientes = list; });
}
// Preserva QUALQUER campo extra vindo do banco (labs, config futura, etc).
// Gravamos o documento inteiro, então descartar campos aqui os apagaria.
function normaliza(r) {
  return {
    ...r,
    config: r.config || {},
    sellers: Array.isArray(r.sellers) ? r.sellers : [],
    fila: Array.isArray(r.fila) ? r.fila : [],
    fora: Array.isArray(r.fora) ? r.fora : [],
    foco: Array.isArray(r.foco) ? r.foco : [],
    metaMes: r.metaMes || {}
  };
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }
// Gravação agrupada: várias ações seguidas viram uma escrita só.
// Evita rajadas de writes (custo no Firestore) e corridas entre dispositivos.
let persistTimer = null, persistPend = false;
function persist() {
  if (aplicandoRemoto) return;
  persistPend = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flush, 400);
}
async function flush() {
  if (!persistPend) return;
  persistPend = false;
  try { await saveState(STORE, state); }
  catch (e) {
    console.error("saveState", e);
    toast(e && e.code === "permission-denied"
      ? "Sem permissão para salvar. Confira as regras do Firestore."
      : "Falha ao salvar. Verifique a conexão.");
  }
}
// Garante a gravação se o usuário fechar a aba no meio
window.addEventListener("beforeunload", () => { if (persistPend) flush(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && persistPend) flush(); });

// ---------- helpers ----------
const seller = (id) => state.sellers.find((s) => s.id === id) || null;
const regsHoje = () => { const h = dateKey(); return records.filter((r) => r.dataKey === h); };
const regsMes  = () => { const m = monthKey(); return records.filter((r) => r.mesKey === m); };
const statsSeller = (id) => agg(regsHoje().filter((r) => r.sellerId === id));
const statsSellerMes = (id) => agg(regsMes().filter((r) => r.sellerId === id));
const emAtendimento = (id) => state.foco.some((f) => f.sellerId === id);
function metaConsultor() { const m = Number(state.metaMes[monthKey()] || 0); const n = state.sellers.filter((s) => s.ativo).length || 1; return m / n; }

// ---------- render ----------
function render() {
  renderKpis(); renderFila(); renderFora(); renderFoco();
  const sub = document.querySelector(".tab.active")?.dataset.sub;
  if (sub === "metas") renderMetas();
  if (sub === "ranking") renderRanking();
  if (sub === "conquistas") renderConquistas();
  if (sub === "dados") renderDados();
}
function avatarHtml(s) { if (s && s.foto) return `<img src="${esc(s.foto)}" alt="">`; return esc(((s && s.nome) || "?").trim()[0] || "?").toUpperCase(); }

function renderKpis() {
  const a = agg(regsHoje());
  const cards = [
    { t: "Atendimentos", v: num(a.atend) }, { t: "Vendas", v: num(a.vendas) },
    { t: "Conversão", v: a.conv.toFixed(0) + "%", accent: true }, { t: "Faturamento", v: money(a.fat) },
    { t: "Ticket médio", v: money(a.tm) }, { t: "Itens/venda", v: a.pa.toFixed(2) }
  ];
  $("kpisTop").innerHTML = cards.map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v">${esc(k.v)}</div></div>`).join("");
}
function renderFila() {
  const el = $("filaList");
  state.fila = state.fila.filter((id) => { const s = seller(id); return s && s.ativo; });
  if (!state.fila.length) { el.innerHTML = `<div class="empty"><div class="glyph">◎</div><div class="t">Fila vazia</div><div class="d">Adicione consultores e toque nos que estão “fora” para entrar na vez.</div></div>`; return; }
  el.innerHTML = state.fila.map((id, i) => {
    const s = seller(id), st = statsSeller(id);
    return `<div class="person"><div class="pos">${i + 1}</div><div class="avatar">${avatarHtml(s)}</div>
      <div class="who"><div class="name">${esc(s.nome)}</div><div class="meta">${st.atend} atend · ${st.conv.toFixed(0)}% · TM ${money(st.tm)}</div></div>
      <div class="acts">
        <button class="btn ghost sm" data-fila="up" data-id="${esc(id)}">↑</button>
        <button class="btn ghost sm" data-fila="down" data-id="${esc(id)}">↓</button>
        <button class="btn ghost sm" data-fila="out" data-id="${esc(id)}">Tirar</button>
        <button class="btn ghost sm icon" data-fila="edit" data-id="${esc(id)}">✎</button>
      </div></div>`;
  }).join("");
}
function renderFora() {
  const el = $("foraList");
  state.sellers.forEach((s) => { if (s.ativo && !state.fila.includes(s.id) && !emAtendimento(s.id) && !state.fora.includes(s.id)) state.fora.push(s.id); });
  state.fora = [...new Set(state.fora.filter((id) => { const s = seller(id); return s && s.ativo && !state.fila.includes(id) && !emAtendimento(id); }))];
  if (!state.fora.length) { el.innerHTML = `<div class="hint">Todos na fila ou em atendimento.</div>`; return; }
  el.innerHTML = state.fora.map((id) => { const s = seller(id);
    return `<div class="person pool" data-enter="${esc(id)}"><div class="avatar">${avatarHtml(s)}</div>
      <div class="who"><div class="name">${esc(s.nome)}</div><div class="meta">toque para entrar</div></div><span class="tag">Fora</span></div>`;
  }).join("");
}
function renderFoco() {
  const panel = $("focoPanel"), tag = $("focoTag");
  state.foco = state.foco.filter((f) => { const s = seller(f.sellerId); return s && s.ativo; });
  if (!state.foco.length) { tag.textContent = "Ninguém"; tag.className = "tag";
    panel.innerHTML = `<div class="empty"><div class="glyph">👓</div><div class="t">Ninguém em atendimento</div><div class="d">Toque em “Chamar próximo”.</div></div>`; return; }
  tag.textContent = state.foco.length + " em foco"; tag.className = "tag go";
  panel.innerHTML = state.foco.map((f) => { const s = seller(f.sellerId), st = statsSeller(f.sellerId), cid = f.id;
    const secs = Math.floor((Date.now() - f.inicioTs) / 1000);
    return `<div class="foco"><div class="top"><div class="lensRing"><div class="inner">${avatarHtml(s)}</div></div>
      <div style="flex:1;min-width:0"><div class="name">${esc(s.nome)}</div>
      <div class="clock">em foco · <b id="clk_${esc(cid)}">${secs}s</b></div>
      <div class="stat">${st.atend} atend · ${st.vendas} vendas · ${st.conv.toFixed(0)}%</div></div>
      <button class="btn ghost sm" data-fin="cancel" data-cid="${esc(cid)}">↩</button></div>
      <div class="bigChoice"><button class="btn go" data-fin="vendeu" data-cid="${esc(cid)}">✓ Vendeu</button>
      <button class="btn stop" data-fin="naovendeu" data-cid="${esc(cid)}">✕ Não vendeu</button></div>
      <div class="finForm" id="fin_${esc(cid)}" style="display:none"></div></div>`;
  }).join("");
}
function finButtons(cid) {
  return `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
    <button class="btn ghost sm" data-fin="close" data-cid="${cid}">Cancelar</button>
    <button class="btn primary sm" data-fin="save" data-cid="${cid}"><span>Finalizar</span></button></div>`;
}
function formVendeu(cid) {
  return `<div class="frow">
    <div class="field"><label>Valor (R$)</label><input class="mono" id="v_valor_${cid}" inputmode="decimal" placeholder="1.890,00"/></div>
    <div class="field"><label>Itens</label><input class="mono" id="v_itens_${cid}" inputmode="numeric" placeholder="2"/></div></div>

    <div class="secLinha">Cliente</div>
    <div class="frow">
      <div class="field"><label>Nome</label><input id="v_cli_${cid}" placeholder="Nome do cliente"/></div>
      <div class="field"><label>Telefone / WhatsApp</label><input id="v_tel_${cid}" inputmode="tel" placeholder="(00) 00000-0000"/></div></div>

    <div class="secLinha">Produto</div>
    <div class="frow">
      <div class="field"><label>Produto</label><select id="v_prod_${cid}">${options(PRODUTOS)}</select></div>
      <div class="field"><label>Tipo de lente</label><select id="v_lente_${cid}">${options(TIPOS_LENTE)}</select></div></div>
    <div class="field full" style="margin-top:10px"><label>Tratamento</label><select id="v_trat_${cid}">${options(TRATAMENTOS)}</select></div>

    <div class="secLinha">Receita <span class="op">opcional</span></div>
    <div class="rxMini">
      <table class="rxTable"><thead><tr><th></th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>Adição</th></tr></thead>
        <tbody>
          <tr><td>OD</td>
            <td><input id="v_od_esf_${cid}" inputmode="decimal" placeholder="0,00"/></td>
            <td><input id="v_od_cil_${cid}" inputmode="decimal" placeholder="0,00"/></td>
            <td><input id="v_od_eixo_${cid}" inputmode="numeric" placeholder="0°"/></td>
            <td><input id="v_od_add_${cid}" inputmode="decimal" placeholder="0,00"/></td></tr>
          <tr><td>OE</td>
            <td><input id="v_oe_esf_${cid}" inputmode="decimal" placeholder="0,00"/></td>
            <td><input id="v_oe_cil_${cid}" inputmode="decimal" placeholder="0,00"/></td>
            <td><input id="v_oe_eixo_${cid}" inputmode="numeric" placeholder="0°"/></td>
            <td><input id="v_oe_add_${cid}" inputmode="decimal" placeholder="0,00"/></td></tr>
        </tbody></table>
      <div class="rxNote">Use − para negativo. DNP e altura são pedidos na OS de laboratório.</div>

      <div class="anexo" id="v_anexoBox_${cid}">
        <label class="anexoBtn" for="v_rxFile_${cid}">
          <span class="ic">📎</span>
          <span><b>Anexar foto da receita</b><small>Tire a foto reta, com a receita bem iluminada</small></span>
        </label>
        <input type="file" id="v_rxFile_${cid}" accept="image/*" capture="environment" hidden/>
        <div class="anexoPrev" id="v_rxPrev_${cid}" style="display:none">
          <img id="v_rxImg_${cid}" alt="Receita anexada"/>
          <div class="anexoInfo"><b>Receita anexada</b><small id="v_rxInfo_${cid}"></small></div>
          <div class="anexoActs">
            <button type="button" class="btn ghost sm" data-verrx="${cid}">Ver</button>
            <button type="button" class="btn ghost sm icon" data-delrx="${cid}" title="Remover">✕</button>
          </div>
        </div>
      </div>
    </div>

    <div class="field full" style="margin-top:12px"><label>Observação</label><input id="v_obs_${cid}" placeholder="Opcional"/></div>
    <label class="chk"><input type="checkbox" id="v_os_${cid}"/> Gerar OS de laboratório ao finalizar</label>
    ${finButtons(cid)}`;
}
function formNao(cid) {
  return `<div class="frow">
    <div class="field"><label>Motivo</label><select id="n_motivo_${cid}">${options(MOTIVOS_NAO)}</select></div>
    <div class="field"><label>Produto de interesse</label><select id="n_prod_${cid}">${options(PRODUTOS)}</select></div></div>
    <div class="frow" style="margin-top:10px">
      <div class="field"><label>Gênero</label><select id="n_gen_${cid}">${options(GENEROS)}</select></div>
      <div class="field"><label>Modelo / referência</label><input id="n_ref_${cid}" placeholder="Opcional"/></div></div>
    <div class="field full" style="margin-top:10px"><label>Observação</label><input id="n_obs_${cid}" placeholder="Opcional"/></div>
    ${finButtons(cid)}`;
}

// ---------- ações ----------
function chamarProximo() {
  while (state.fila.length) {
    const id = state.fila[0], s = seller(id);
    if (!s || !s.ativo || emAtendimento(id)) { state.fila.shift(); continue; }
    state.foco.push({ id: uid(), sellerId: id, inicioTs: Date.now() });
    state.fila.shift(); render(); persist(); return;
  }
  toast("A fila está vazia.");
}
function filaAction(act, id) {
  if (act === "edit") { abrirSeller(id); return; }
  const i = state.fila.indexOf(id);
  if (act === "up" && i > 0) [state.fila[i - 1], state.fila[i]] = [state.fila[i], state.fila[i - 1]];
  if (act === "down" && i >= 0 && i < state.fila.length - 1) [state.fila[i + 1], state.fila[i]] = [state.fila[i], state.fila[i + 1]];
  if (act === "out") { state.fila = state.fila.filter((x) => x !== id); if (!state.fora.includes(id)) state.fora.push(id); }
  render(); persist();
}
function entrarNaFila(id) { state.fora = state.fora.filter((x) => x !== id); if (!state.fila.includes(id)) state.fila.push(id); render(); persist(); }
function finAction(act, cid) {
  const f = state.foco.find((x) => x.id === cid); if (!f && act !== "close") return;
  if (act === "cancel") { state.foco = state.foco.filter((x) => x.id !== cid); if (!state.fila.includes(f.sellerId)) state.fila.push(f.sellerId); render(); persist(); return; }
  const box = $("fin_" + cid);
  if (act === "vendeu") { box.style.display = "block"; box.dataset.tipo = "vendeu"; box.innerHTML = formVendeu(cid); return; }
  if (act === "naovendeu") { box.style.display = "block"; box.dataset.tipo = "naovendeu"; box.innerHTML = formNao(cid); return; }
  if (act === "close") { const b = $("fin_" + cid); if (b) { b.style.display = "none"; b.innerHTML = ""; } return; }
  if (act === "save") finalizar(cid);
}
// receitas anexadas, por atendimento (só em memória até finalizar)
const rxAnexo = {};

function lerRxCurta(cid) {
  const g = (k) => { const el = $(`v_${k}_${cid}`); const v = el ? el.value.trim() : ""; return v === "" ? "" : brNum(v); };
  const ax = (k) => { const el = $(`v_${k}_${cid}`); const v = el ? el.value.trim() : ""; return v === "" ? "" : (parseInt(v, 10) || 0); };
  const rx = {
    od: { esf: g("od_esf"), cil: g("od_cil"), eixo: ax("od_eixo"), add: g("od_add"), dnp: "", alt: "" },
    oe: { esf: g("oe_esf"), cil: g("oe_cil"), eixo: ax("oe_eixo"), add: g("oe_add"), dnp: "", alt: "" },
    medico: "", cro: "", dataRx: ""
  };
  const vazia = ["od", "oe"].every((e) => ["esf", "cil", "eixo", "add"].every((k) => rx[e][k] === ""));
  return vazia ? null : rx;
}

async function finalizar(cid) {
  const f = state.foco.find((x) => x.id === cid); if (!f) return;
  const box = $("fin_" + cid), tipo = box.dataset.tipo;
  const base = { id: uid(), sellerId: f.sellerId, sellerNome: (seller(f.sellerId) || {}).nome || "", tsInicio: f.inicioTs, tsFim: Date.now(), dataKey: dateKey(), mesKey: monthKey() };
  let rec;
  if (tipo === "vendeu") {
    rec = Object.assign(base, {
      resultado: "vendeu", valor: brNum($("v_valor_" + cid).value),
      itens: parseInt($("v_itens_" + cid).value || "0", 10) || 0,
      produto: $("v_prod_" + cid).value, lente: $("v_lente_" + cid).value,
      tratamento: $("v_trat_" + cid).value, clienteNome: $("v_cli_" + cid).value.trim(),
      clienteTel: ($("v_tel_" + cid) ? $("v_tel_" + cid).value.trim() : ""),
      receita: lerRxCurta(cid),
      receitaFoto: rxAnexo[cid] || "",
      obs: $("v_obs_" + cid).value.trim(), motivo: "", genero: ""
    });
  } else if (tipo === "naovendeu") {
    rec = Object.assign(base, {
      resultado: "naovendeu", valor: 0, itens: 0,
      produto: $("n_prod_" + cid).value, motivo: $("n_motivo_" + cid).value,
      genero: $("n_gen_" + cid).value, ref: $("n_ref_" + cid).value.trim(),
      obs: $("n_obs_" + cid).value.trim(), lente: "", tratamento: ""
    });
  } else { toast("Escolha ‘Vendeu’ ou ‘Não vendeu’."); return; }

  const gerarOS = tipo === "vendeu" && $("v_os_" + cid) && $("v_os_" + cid).checked;
  try { await addRecord(STORE, rec); } catch (e) { toast("Falha ao registrar."); return; }
  if (tipo === "vendeu" && rec.clienteNome) crmUpsertVenda(rec);
  delete rxAnexo[cid];
  state.foco = state.foco.filter((x) => x.id !== cid);
  if (!state.fila.includes(f.sellerId)) state.fila.push(f.sellerId);
  render(); persist();
  toast(rec.resultado === "vendeu" ? ("Venda de " + money(rec.valor) + " registrada ✓") : "Atendimento registrado.");
  if (gerarOS) {
    sessionStorage.setItem("omnia_os_prefill", JSON.stringify({
      cli: rec.clienteNome || "", tel: rec.clienteTel || "", sellerId: rec.sellerId,
      vLente: rec.valor || 0, tipoLente: rec.lente || "",
      receita: rec.receita || null, receitaFoto: rec.receitaFoto || ""
    }));
    location.href = "laboratorio.html";
  }
}
async function crmUpsertVenda(rec) {
  const s = seller(rec.sellerId);
  const dplus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };
  const grau = /(grau|lente|multifocal|visão|bifocal|contato)/i.test((rec.produto || "") + " " + (rec.lente || ""));
  const k = rec.clienteNome.trim().toLowerCase();
  let c = clientes.find((x) => (x.nome || "").trim().toLowerCase() === k);
  if (!c) c = { id: "cli_" + uid(), nome: rec.clienteNome.trim(), telefone: rec.clienteTel || "", nascimento: "", etapa: "fechado", obs: "", compras: [], proximoRetorno: "", ownerId: rec.sellerId, ownerNome: s ? s.nome : "", ultimaCompraTs: 0, criadoEm: Date.now() };
  c.compras = c.compras || [];
  c.compras.push({ valor: rec.valor || 0, desc: (rec.produto || "Venda") + (rec.lente && rec.lente !== "Não se aplica" ? " · " + rec.lente : ""), ts: Date.now() });
  c.ultimaCompraTs = Date.now(); c.etapa = "fechado";
  if (rec.clienteTel && !c.telefone) c.telefone = rec.clienteTel; // não sobrescreve o que já existe
  if (!c.ownerId) { c.ownerId = rec.sellerId; c.ownerNome = s ? s.nome : ""; }
  if (grau) c.proximoRetorno = dplus(365);
  c.atualizadoEm = Date.now();
  try { await saveCliente(STORE, c); } catch (e) { /* silencioso */ }
}

// ---------- consultor (modal) ----------
let fotoTemp = "";
function abrirSeller(id) {
  const s = id ? seller(id) : null;
  $("sellerModalTitle").textContent = s ? "Editar consultor" : "Novo consultor";
  $("sellerEditId").value = s ? s.id : "";
  $("sellerName").value = s ? s.nome : "";
  fotoTemp = s ? s.foto : "";
  const prev = $("sellerPhotoPrev");
  if (fotoTemp) { prev.src = fotoTemp; prev.style.display = "block"; } else prev.style.display = "none";
  $("sellerPhoto").value = "";
  $("btnDeleteSeller").style.display = s ? "inline-flex" : "none";
  openModal("sellerBack");
}
function salvarSeller() {
  const nome = $("sellerName").value.trim(); if (!nome) { toast("Digite o nome."); return; }
  const id = $("sellerEditId").value;
  if (id) { const s = seller(id); if (s) { s.nome = nome; s.foto = fotoTemp; } }
  else { const ns = { id: uid(), nome, foto: fotoTemp, ativo: true }; state.sellers.push(ns); state.fora.push(ns.id); }
  closeModal("sellerBack"); render(); persist(); toast("Consultor salvo ✓");
}
function removerSeller() {
  const id = $("sellerEditId").value; if (!id) return;
  if (!confirm("Remover este consultor? Os registros dele continuam no histórico.")) return;
  state.sellers = state.sellers.filter((s) => s.id !== id);
  state.fila = state.fila.filter((x) => x !== id);
  state.fora = state.fora.filter((x) => x !== id);
  state.foco = state.foco.filter((f) => f.sellerId !== id);
  closeModal("sellerBack"); render(); persist(); toast("Consultor removido.");
}

// ---------- metas ----------
function renderMetas() {
  const mk = monthKey(), meta = Number(state.metaMes[mk] || 0);
  $("metaInput").value = meta ? String(meta).replace(".", ",") : "";
  const fatMes = regsMes().filter((r) => r.resultado === "vendeu").reduce((s, r) => s + Number(r.valor || 0), 0);
  const pct = meta > 0 ? clamp(fatMes / meta * 100, 0, 100) : 0;
  const hoje = agg(regsHoje()).fat;
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const restam = Math.max(1, diasNoMes - new Date().getDate() + 1);
  const metaDia = meta > 0 ? Math.max(0, (meta - fatMes) / restam) : 0;
  const pctDia = metaDia > 0 ? clamp(hoje / metaDia * 100, 0, 100) : (hoje > 0 ? 100 : 0);
  const blur = Math.max(0, 5.5 - pct / 100 * 5.5).toFixed(2), op = (0.45 + pct / 100 * 0.55).toFixed(2);
  $("metasBody").innerHTML = `<div class="metaWrap">
    <div class="acuity"><div class="chart" style="filter:blur(${blur}px);opacity:${op};color:${pct >= 100 ? "var(--go)" : "var(--ink)"}">O M N I A</div>
      <div class="pct" style="color:${pct >= 100 ? "var(--go)" : "var(--ink)"}">${pct.toFixed(0)}%</div>
      <div class="lbl">da meta do mês — a visão fica nítida ao bater 100%</div></div>
    <div><div class="progItem"><div class="metaLine"><span class="k">Mês</span><span class="v">${money(fatMes)} / ${money(meta)}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="tiny" style="margin-top:6px">Faltam ${money(Math.max(0, meta - fatMes))} · ${restam} dia(s) restantes</div></div>
    <div class="progItem"><div class="metaLine"><span class="k">Hoje</span><span class="v">${money(hoje)} / ${money(metaDia)}</span></div>
      <div class="bar"><i style="width:${pctDia}%"></i></div>
      <div class="tiny" style="margin-top:6px">Meta diária = o que falta ÷ dias restantes</div></div></div></div>`;
}

// ---------- ranking ----------
function renderRanking() {
  const rows = state.sellers.map((s) => ({ s, ...statsSeller(s.id) })).filter((r) => r.atend > 0).sort((a, b) => b.conv - a.conv || b.fat - a.fat);
  const body = $("rankBody");
  if (!rows.length) { body.innerHTML = `<div class="empty"><div class="glyph">🏁</div><div class="t">Sem dados ainda</div><div class="d">Finalize atendimentos para o ranking aparecer.</div></div>`; return; }
  body.innerHTML = `<table><thead><tr><th>#</th><th>Consultor</th><th class="num">Atend</th><th class="num">Vendas</th><th class="num">Conv</th><th class="num">Ticket</th><th class="num">Faturamento</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td class="rankPos${i === 0 ? " top" : ""}">${i + 1}</td>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="avatar" style="width:30px;height:30px;font-size:14px">${avatarHtml(r.s)}</div>${esc(r.s.nome)}</div></td>
      <td class="num">${r.atend}</td><td class="num">${r.vendas}</td><td class="num">${r.conv.toFixed(0)}%</td>
      <td class="num">${money(r.tm)}</td><td class="num">${money(r.fat)}</td></tr>`).join("")}</tbody></table>`;
}

// ---------- conquistas ----------
function sellerMesDet(id) {
  const rs = regsMes().filter((r) => r.sellerId === id && r.resultado === "vendeu");
  let combos = 0, multi = 0, maior = 0;
  rs.forEach((r) => { if (Number(r.itens || 0) >= 2) combos++; const t = ((r.produto || "") + " " + (r.lente || "")).toLowerCase(); if (t.includes("multifocal")) multi++; maior = Math.max(maior, Number(r.valor || 0)); });
  return { combos, multi, maior };
}
const pontosSeller = (id) => { const a = statsSellerMes(id); return Math.round(a.fat + a.vendas * 50 + a.itens * 25); };
const selosDe = (id, g) => SELOS.filter((s) => s.test(statsSellerMes(id), sellerMesDet(id), g)).length;
function renderConquistas() {
  const sel = $("seloSeller");
  if (!sel.dataset.filled) { sel.innerHTML = state.sellers.filter((s) => s.ativo).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join(""); sel.dataset.filled = "1"; }
  const id = sel.value || (state.sellers[0] || {}).id; if (!id) { $("seloGrid").innerHTML = `<div class="hint">Cadastre consultores.</div>`; return; }
  const a = statsSellerMes(id), d = sellerMesDet(id), g = metaConsultor();
  $("seloKpis").innerHTML = [
    { t: "Faturamento no mês", v: money(a.fat) }, { t: "Conversão", v: a.conv.toFixed(0) + "%", accent: true },
    { t: "Ticket médio", v: money(a.tm) }, { t: "Pontos", v: num(pontosSeller(id)) }
  ].map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v">${esc(k.v)}</div></div>`).join("");
  $("seloGrid").innerHTML = SELOS.map((s) => { const on = s.test(a, d, g);
    return `<div class="selo${on ? "" : " locked"}"><div class="ic">${s.ic}</div><div><div class="st">${esc(s.st)}</div><div class="sd">${esc(s.sd)}</div>
      <span class="tag ${on ? "go" : ""}" style="margin-top:6px;display:inline-block">${on ? "Conquistado" : "Bloqueado"}</span></div></div>`;
  }).join("");
  const rank = state.sellers.filter((s) => s.ativo).map((s) => ({ s, p: pontosSeller(s.id), c: selosDe(s.id, g) })).sort((a, b) => b.p - a.p);
  $("seloRank").innerHTML = `<div class="sectionLabel">Ranking de pontos do mês</div>
    <table><thead><tr><th>#</th><th>Consultor</th><th class="num">Selos</th><th class="num">Pontos</th></tr></thead><tbody>
    ${rank.map((r, i) => `<tr><td class="rankPos${i === 0 ? " top" : ""}">${i + 1}</td><td>${esc(r.s.nome)}</td><td class="num">${r.c}/${SELOS.length}</td><td class="num">${num(r.p)}</td></tr>`).join("")}</tbody></table>`;
}

// ---------- registros ----------
function renderDados() {
  const rs = regsHoje().slice().sort((a, b) => (b.tsFim || 0) - (a.tsFim || 0));
  const body = $("dadosBody");
  if (!rs.length) { body.innerHTML = `<div class="empty"><div class="glyph">🗂️</div><div class="t">Nenhum registro hoje</div><div class="d">Cada atendimento finalizado entra aqui.</div></div>`; return; }
  body.innerHTML = `<table><thead><tr><th>Hora</th><th>Consultor</th><th>Resultado</th><th>Produto</th><th class="num">Valor</th><th class="num">Itens</th><th>Detalhe</th></tr></thead><tbody>
    ${rs.map((r) => { const s = seller(r.sellerId);
      return `<tr><td class="mono">${hhmm(r.tsFim || r.tsInicio)}</td><td>${esc(s ? s.nome : r.sellerNome || "—")}</td>
        <td><span class="tag ${r.resultado === "vendeu" ? "go" : "warn"}">${r.resultado === "vendeu" ? "Vendeu" : "Não vendeu"}</span></td>
        <td>${esc(r.produto || "—")}</td><td class="num">${r.resultado === "vendeu" ? money(r.valor) : "—"}</td>
        <td class="num">${r.resultado === "vendeu" ? num(r.itens) : "—"}</td>
        <td class="hint">${esc(r.resultado === "vendeu" ? (r.lente || "—") : (r.motivo || "—"))}</td></tr>`;
    }).join("")}</tbody></table>`;
}
function exportCSV() {
  const rs = regsHoje(); if (!rs.length) { toast("Nada para exportar hoje."); return; }
  const head = ["Hora", "Consultor", "Resultado", "Produto", "Lente", "Tratamento", "Valor", "Itens", "Motivo", "Genero", "Obs"];
  const linhas = rs.map((r) => { const s = seller(r.sellerId);
    return [hhmm(r.tsFim || r.tsInicio), s ? s.nome : r.sellerNome || "", r.resultado === "vendeu" ? "Vendeu" : "Nao vendeu",
      r.produto || "", r.lente || "", r.tratamento || "", Number(r.valor || 0).toFixed(2).replace(".", ","), r.itens || 0, r.motivo || "", r.genero || "", r.obs || ""]; });
  const csv = [head, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadBlob(csv, "omnia_" + (STORE || "otica") + "_" + dateKey() + ".csv");
}

// ---------- eventos ----------
function wireEvents() {
  document.querySelectorAll(".tab[data-sub]").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-sub]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["ops", "metas", "ranking", "conquistas", "dados"].forEach((v) => {
      const el = $("sub" + v.charAt(0).toUpperCase() + v.slice(1)); if (el) el.style.display = v === t.dataset.sub ? "block" : "none";
    });
    render();
  }));
  $("btnCallNext").addEventListener("click", chamarProximo);
  $("filaList").addEventListener("click", (e) => { const b = e.target.closest("button[data-fila]"); if (b) filaAction(b.dataset.fila, b.dataset.id); });
  $("foraList").addEventListener("click", (e) => { const p = e.target.closest("[data-enter]"); if (p) entrarNaFila(p.dataset.enter); });
  $("focoPanel").addEventListener("click", (e) => {
    const ver = e.target.closest("[data-verrx]");
    if (ver) { if (rxAnexo[ver.dataset.verrx]) abrirImagem(rxAnexo[ver.dataset.verrx]); return; }
    const del = e.target.closest("[data-delrx]");
    if (del) { const c = del.dataset.delrx; delete rxAnexo[c];
      $("v_rxPrev_" + c).style.display = "none";
      $("v_anexoBox_" + c).querySelector(".anexoBtn").style.display = "flex";
      $("v_rxFile_" + c).value = ""; return; }
    const b = e.target.closest("button[data-fin]"); if (b) finAction(b.dataset.fin, b.dataset.cid);
  });
  // anexo da receita: comprime para caber no documento sem perder legibilidade
  $("focoPanel").addEventListener("change", async (e) => {
    const inp = e.target.closest("input[type=file][id^=v_rxFile_]");
    if (!inp) return;
    const cid = inp.id.replace("v_rxFile_", "");
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      toast("Preparando a foto…");
      const r = await comprimirDocumento(f);
      rxAnexo[cid] = r.dataUrl;
      $("v_rxImg_" + cid).src = r.dataUrl;
      $("v_rxInfo_" + cid).textContent = `${r.largura}×${r.altura} · ${tamanhoLegivel(r.bytes)}`;
      $("v_rxPrev_" + cid).style.display = "flex";
      $("v_anexoBox_" + cid).querySelector(".anexoBtn").style.display = "none";
      toast("Receita anexada ✓");
    } catch (err) {
      console.error(err);
      toast(err.message === "imagem grande demais"
        ? "A foto ficou grande demais. Tente enquadrar só a receita."
        : "Não foi possível ler a imagem.");
      inp.value = "";
    }
  });
  $("btnAddSeller").addEventListener("click", () => abrirSeller(null));
  $("btnSaveSeller").addEventListener("click", salvarSeller);
  $("btnDeleteSeller").addEventListener("click", removerSeller);
  $("sellerPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { fotoTemp = await comprimirImagem(f); const p = $("sellerPhotoPrev"); p.src = fotoTemp; p.style.display = "block"; } catch (_) { toast("Não deu para ler a imagem."); }
  });
  $("btnSaveMeta").addEventListener("click", () => { state.metaMes[monthKey()] = brNum($("metaInput").value); render(); persist(); toast("Meta salva ✓"); });
  $("seloSeller").addEventListener("change", renderConquistas);
  $("btnExport").addEventListener("click", exportCSV);

  setInterval(() => { for (const f of state.foco) { const el = $("clk_" + f.id); if (el) el.textContent = Math.floor((Date.now() - f.inicioTs) / 1000) + "s"; } }, 1000);
}
