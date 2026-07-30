import { initShell } from "./session.js";
import { subscribeState, subscribeRecords, subscribeOS } from "./db.js";
import {
  $, esc, money, num, dateKey, monthKey, fmtData, toast, downloadBlob
} from "./utils.js";
import { agg, OS_STATUS, statusInfo, osNumero } from "./domain.js";

let CTX, STORE;
let sellers = [], records = [], osList = [];
let periodo = "mes", sellerFiltro = "", aba = "resumo";

init();
async function init() {
  CTX = await initShell("relatorios");
  STORE = CTX.storeId;
  wireEvents();
  aplicarPeriodoPadrao();
  subscribeState(STORE, (st) => { sellers = (st && st.sellers) || []; fillSellers(); reveal(); render(); });
  subscribeRecords(STORE, (list) => { records = list; reveal(); render(); });
  subscribeOS(STORE, (list) => { osList = list; render(); });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }

/* ---------- período (sempre em datas LOCAIS) ---------- */
function addDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function intervalo() {
  const hoje = new Date();
  if (periodo === "hoje")   return [dateKey(hoje), dateKey(hoje)];
  if (periodo === "7")      return [dateKey(addDias(hoje, -6)), dateKey(hoje)];
  if (periodo === "30")     return [dateKey(addDias(hoje, -29)), dateKey(hoje)];
  if (periodo === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return [dateKey(ini), dateKey(hoje)];
  }
  if (periodo === "mesant") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return [dateKey(ini), dateKey(fim)];
  }
  return [$("dtDe").value || dateKey(hoje), $("dtAte").value || dateKey(hoje)];
}
function aplicarPeriodoPadrao() {
  const hoje = new Date();
  $("dtDe").value = dateKey(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  $("dtAte").value = dateKey(hoje);
  toggleCustom();
}
function toggleCustom() {
  const v = periodo === "custom" ? "block" : "none";
  $("wrapDe").style.display = v; $("wrapAte").style.display = v;
}
function fillSellers() {
  const cur = $("filtroSeller").value;
  $("filtroSeller").innerHTML = `<option value="">Todos os consultores</option>` +
    sellers.map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");
  if (cur) $("filtroSeller").value = cur;
}

/* ---------- seleção de dados ---------- */
function noPeriodo() {
  const [de, ate] = intervalo();
  return records.filter((r) => {
    const d = r.dataKey || "";
    if (d < de || d > ate) return false;
    if (sellerFiltro && r.sellerId !== sellerFiltro) return false;
    return true;
  });
}
const nomeSeller = (id) => (sellers.find((s) => s.id === id) || {}).nome || "—";

/* ---------- render ---------- */
function render() {
  const [de, ate] = intervalo();
  $("periodoLabel").innerHTML = `Analisando de <b>${fmtData(de)}</b> a <b>${fmtData(ate)}</b>` +
    (sellerFiltro ? ` · consultor <b>${esc(nomeSeller(sellerFiltro))}</b>` : "") + ".";
  const rs = noPeriodo(), a = agg(rs);
  const dias = new Set(rs.map((r) => r.dataKey)).size || 1;

  $("relKpis").innerHTML = [
    { t: "Atendimentos", v: num(a.atend) },
    { t: "Vendas", v: num(a.vendas) },
    { t: "Conversão", v: a.conv.toFixed(0) + "%", accent: true },
    { t: "Faturamento", v: money(a.fat) },
    { t: "Ticket médio", v: money(a.tm) },
    { t: "Média por dia", v: money(a.fat / dias) }
  ].map((k) => `<div class="kpi${k.accent ? " accent" : ""}"><div class="t">${esc(k.t)}</div><div class="v">${esc(k.v)}</div></div>`).join("");

  if (aba === "resumo")      renderResumo(rs);
  if (aba === "consultores") renderConsultores(rs);
  if (aba === "produtos")    renderProdutos(rs);
  if (aba === "perdas")      renderPerdas(rs);
  if (aba === "lab")         renderLab();
}

function vazio(msg) {
  return `<div class="empty"><div class="glyph">📊</div><div class="t">Sem dados no período</div><div class="d">${esc(msg)}</div></div>`;
}

// tabela genérica de agrupamento
function tabelaGrupo(mapa, rotulo, total) {
  const linhas = Object.entries(mapa).sort((a, b) => b[1].fat - a[1].fat);
  if (!linhas.length) return `<div class="hint">Sem dados.</div>`;
  return `<table><thead><tr><th>${esc(rotulo)}</th><th class="num">Vendas</th><th class="num">Itens</th><th class="num">Faturamento</th><th class="num">%</th></tr></thead><tbody>
    ${linhas.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${num(v.qtd)}</td><td class="num">${num(v.itens)}</td>
      <td class="num">${money(v.fat)}</td><td class="num">${total ? (v.fat / total * 100).toFixed(0) : 0}%</td></tr>`).join("")}
  </tbody></table>`;
}

function renderResumo(rs) {
  if (!rs.length) { $("boxResumo").innerHTML = vazio("Escolha outro período ou registre atendimentos."); return; }
  // evolução por dia
  const porDia = {};
  rs.forEach((r) => {
    const d = r.dataKey;
    porDia[d] = porDia[d] || { atend: 0, vendas: 0, fat: 0 };
    porDia[d].atend++;
    if (r.resultado === "vendeu") { porDia[d].vendas++; porDia[d].fat += Number(r.valor || 0); }
  });
  const dias = Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0]));
  const maxFat = Math.max(...dias.map((d) => d[1].fat), 1);
  $("boxResumo").innerHTML = `
    <div class="sectionLabel">Evolução diária</div>
    <div class="barsWrap">
      ${dias.map(([d, v]) => `<div class="barDia" title="${esc(fmtData(d))} — ${esc(money(v.fat))}">
        <div class="barCol"><i style="height:${Math.max(2, v.fat / maxFat * 100)}%"></i></div>
        <div class="barLbl">${esc(fmtData(d))}</div></div>`).join("")}
    </div>
    <div class="divider"></div>
    <div class="sectionLabel">Detalhe por dia</div>
    <table><thead><tr><th>Dia</th><th class="num">Atend.</th><th class="num">Vendas</th><th class="num">Conv.</th><th class="num">Faturamento</th></tr></thead><tbody>
      ${dias.map(([d, v]) => `<tr><td>${esc(fmtData(d))}</td><td class="num">${v.atend}</td><td class="num">${v.vendas}</td>
        <td class="num">${v.atend ? (v.vendas / v.atend * 100).toFixed(0) : 0}%</td><td class="num">${money(v.fat)}</td></tr>`).join("")}
    </tbody></table>`;
}

function renderConsultores(rs) {
  const ids = [...new Set(rs.map((r) => r.sellerId))];
  if (!ids.length) { $("boxConsultores").innerHTML = vazio("Nenhum atendimento registrado."); return; }
  const linhas = ids.map((id) => ({ id, nome: nomeSeller(id), ...agg(rs.filter((r) => r.sellerId === id)) }))
    .sort((a, b) => b.fat - a.fat);
  $("boxConsultores").innerHTML = `<table><thead><tr><th>#</th><th>Consultor</th><th class="num">Atend.</th><th class="num">Vendas</th>
    <th class="num">Conv.</th><th class="num">Ticket</th><th class="num">P.A.</th><th class="num">Faturamento</th></tr></thead><tbody>
    ${linhas.map((r, i) => `<tr><td class="rankPos${i === 0 ? " top" : ""}">${i + 1}</td><td>${esc(r.nome)}</td>
      <td class="num">${r.atend}</td><td class="num">${r.vendas}</td><td class="num">${r.conv.toFixed(0)}%</td>
      <td class="num">${money(r.tm)}</td><td class="num">${r.pa.toFixed(2)}</td><td class="num">${money(r.fat)}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderProdutos(rs) {
  const vendas = rs.filter((r) => r.resultado === "vendeu");
  if (!vendas.length) { $("boxProdutos").innerHTML = vazio("Nenhuma venda no período."); return; }
  const total = vendas.reduce((s, r) => s + Number(r.valor || 0), 0);
  const grupo = (campo) => {
    const m = {};
    vendas.forEach((r) => {
      const k = r[campo] || "—";
      m[k] = m[k] || { qtd: 0, itens: 0, fat: 0 };
      m[k].qtd++; m[k].itens += Number(r.itens || 0); m[k].fat += Number(r.valor || 0);
    });
    return m;
  };
  $("boxProdutos").innerHTML = `
    <div class="sectionLabel">Por produto</div>${tabelaGrupo(grupo("produto"), "Produto", total)}
    <div class="divider"></div>
    <div class="sectionLabel">Por tipo de lente</div>${tabelaGrupo(grupo("lente"), "Tipo de lente", total)}
    <div class="divider"></div>
    <div class="sectionLabel">Por tratamento</div>${tabelaGrupo(grupo("tratamento"), "Tratamento", total)}`;
}

function renderPerdas(rs) {
  const nv = rs.filter((r) => r.resultado === "naovendeu");
  const box = $("boxPerdas");
  if (!nv.length) {
    box.innerHTML = `<div class="empty"><div class="glyph">🎯</div><div class="t">Nenhuma perda no período</div>
      <div class="d">Todos os atendimentos converteram — ou ainda não há registros.</div></div>`;
    return;
  }
  const conv = rs.length ? rs.filter((r) => r.resultado === "vendeu").length / rs.length * 100 : 0;
  const by = (campo) => {
    const m = {};
    nv.forEach((r) => { const k = r[campo] || "—"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const tbl = (rows, rotulo) => rows.length
    ? `<table><thead><tr><th>${esc(rotulo)}</th><th class="num">Qtde</th><th class="num">%</th><th style="width:34%">Peso</th></tr></thead><tbody>
       ${rows.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${n}</td><td class="num">${(n / nv.length * 100).toFixed(0)}%</td>
         <td><div class="bar" style="margin:0"><i style="width:${n / rows[0][1] * 100}%"></i></div></td></tr>`).join("")}
       </tbody></table>`
    : `<div class="hint">Sem dados.</div>`;
  box.innerHTML = `
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi accent"><div class="t">Conversão do período</div><div class="v">${conv.toFixed(0)}%</div></div>
      <div class="kpi"><div class="t">Atendimentos</div><div class="v">${rs.length}</div></div>
      <div class="kpi"><div class="t">Não convertidos</div><div class="v" style="color:var(--stop)">${nv.length}</div></div>
    </div>
    <div class="sectionLabel">Por motivo da perda</div>${tbl(by("motivo"), "Motivo")}
    <div class="divider"></div>
    <div class="sectionLabel">Por produto de interesse</div>${tbl(by("produto"), "Produto")}
    <div class="divider"></div>
    <div class="sectionLabel">Por gênero</div>${tbl(by("genero"), "Gênero")}`;
}

function renderLab() {
  const box = $("boxLab");
  if (!osList.length) { box.innerHTML = vazio("Nenhuma OS de laboratório cadastrada."); return; }
  const [de, ate] = intervalo();
  const noPer = osList.filter((o) => {
    const d = (o.datas && o.datas.entrada) || "";
    return !d || (d >= de && d <= ate);
  });
  const atrasadas = osList.filter((o) => o.datas && o.datas.previsao && o.datas.previsao < dateKey() && o.status !== "entregue");
  // tempo médio de entrega
  const entregues = osList.filter((o) => o.status === "entregue" && o.datas && o.datas.entrada && o.datas.entrega);
  let mediaDias = 0;
  if (entregues.length) {
    const soma = entregues.reduce((s, o) => {
      const ini = new Date(o.datas.entrada + "T00:00:00"), fim = new Date(o.datas.entrega + "T00:00:00");
      return s + Math.max(0, Math.round((fim - ini) / 864e5));
    }, 0);
    mediaDias = soma / entregues.length;
  }
  const porStatus = OS_STATUS.map((st) => ({ st, n: osList.filter((o) => o.status === st.k).length }));
  const porLab = {};
  osList.forEach((o) => { const k = o.laboratorio || "—"; porLab[k] = (porLab[k] || 0) + 1; });

  box.innerHTML = `
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="t">OS no período</div><div class="v">${num(noPer.length)}</div></div>
      <div class="kpi"><div class="t">Em aberto</div><div class="v">${num(osList.filter((o) => o.status !== "entregue").length)}</div></div>
      <div class="kpi"><div class="t">Atrasadas</div><div class="v" style="${atrasadas.length ? "color:var(--stop)" : ""}">${num(atrasadas.length)}</div></div>
      <div class="kpi accent"><div class="t">Prazo médio</div><div class="v">${mediaDias ? mediaDias.toFixed(1) + " d" : "—"}</div></div>
    </div>
    <div class="sectionLabel">Distribuição por etapa</div>
    <table><thead><tr><th>Etapa</th><th class="num">OS</th><th style="width:40%">Peso</th></tr></thead><tbody>
      ${porStatus.map((x) => `<tr><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${x.st.cor};margin-right:8px"></span>${esc(x.st.n)}</td>
        <td class="num">${x.n}</td><td><div class="bar" style="margin:0"><i style="width:${osList.length ? x.n / osList.length * 100 : 0}%"></i></div></td></tr>`).join("")}
    </tbody></table>
    ${atrasadas.length ? `<div class="divider"></div><div class="sectionLabel">OS atrasadas — atenção</div>
      <table><thead><tr><th>OS</th><th>Cliente</th><th>Etapa</th><th>Previsão</th><th class="num">Saldo</th></tr></thead><tbody>
      ${atrasadas.sort((a, b) => (a.datas.previsao || "").localeCompare(b.datas.previsao || "")).map((o) => `<tr>
        <td class="mono">${esc(osNumero(o.numero))}</td><td>${esc(o.clienteNome || "—")}</td>
        <td>${esc(statusInfo(o.status).n)}</td><td class="late">${esc(fmtData(o.datas.previsao))} ⚠</td>
        <td class="num">${money((o.valores || {}).saldo || 0)}</td></tr>`).join("")}
      </tbody></table>` : ""}
    <div class="divider"></div>
    <div class="sectionLabel">Por laboratório</div>
    <table><thead><tr><th>Laboratório</th><th class="num">OS</th></tr></thead><tbody>
      ${Object.entries(porLab).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${n}</td></tr>`).join("")}
    </tbody></table>`;
}

/* ---------- exportação ---------- */
function exportar() {
  const rs = noPeriodo();
  if (!rs.length) { toast("Nada para exportar neste período."); return; }
  const head = ["Data", "Hora", "Consultor", "Resultado", "Produto", "Lente", "Tratamento",
                "Valor", "Itens", "Motivo", "Genero", "Cliente", "Obs"];
  const linhas = rs.sort((a, b) => (a.tsFim || 0) - (b.tsFim || 0)).map((r) => {
    const d = new Date(r.tsFim || r.tsInicio || Date.now());
    return [r.dataKey || "", String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
      nomeSeller(r.sellerId), r.resultado === "vendeu" ? "Vendeu" : "Nao vendeu",
      r.produto || "", r.lente || "", r.tratamento || "",
      Number(r.valor || 0).toFixed(2).replace(".", ","), r.itens || 0,
      r.motivo || "", r.genero || "", r.clienteNome || "", r.obs || ""];
  });
  const csv = [head, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const [de, ate] = intervalo();
  downloadBlob(csv, `omnia_relatorio_${de}_a_${ate}.csv`);
  toast("Relatório exportado ✓");
}

/* ---------- eventos ---------- */
function wireEvents() {
  $("periodo").addEventListener("change", (e) => { periodo = e.target.value; toggleCustom(); render(); });
  $("dtDe").addEventListener("change", render);
  $("dtAte").addEventListener("change", render);
  $("filtroSeller").addEventListener("change", (e) => { sellerFiltro = e.target.value; render(); });
  $("btnExportRel").addEventListener("click", exportar);
  document.querySelectorAll(".tab[data-rel]").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-rel]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    aba = t.dataset.rel;
    ["resumo", "consultores", "produtos", "perdas", "lab"].forEach((v) => {
      const el = $("rel" + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.style.display = v === aba ? "block" : "none";
    });
    render();
  }));
}
