// ============================================================
// Catálogo público — o cliente abre pelo link do consultor.
// NÃO exige login. Depende de "allow read: if true" em
// /produtos e /vendedores nas regras do Firestore.
// Link: catalogo-publico.html?loja=STOREID&v=UID_DO_CONSULTOR
// ============================================================
import { getProdutosPublico, getLojaPublica, getVendedorPublico } from "./db.js";
import { $, esc, money, toast, openModal, closeModal, wireModals, waLink, primeiroNome } from "./utils.js";

let produtos = [], lista = [], loja = null, vendedor = null;
let busca = "", cat = "Todos";

const par = new URLSearchParams(location.search);
const STORE = par.get("loja") || "";
const VEND = par.get("v") || "";

init();
async function init() {
  wireModals();
  wireEvents();
  if (!STORE) { falha("Link incompleto", "Peça ao consultor o link correto do catálogo."); return; }
  try {
    const [l, ps] = await Promise.all([
      getLojaPublica(STORE).catch(() => null),
      getProdutosPublico(STORE)
    ]);
    loja = l;
    produtos = ps;
    if (VEND) vendedor = await getVendedorPublico(STORE, VEND).catch(() => null);
  } catch (e) {
    console.error(e);
    falha("Catálogo indisponível",
      (e && e.code === "permission-denied")
        ? "A ótica precisa liberar a leitura pública do catálogo nas regras do Firestore."
        : "Não foi possível carregar. Tente novamente em instantes.");
    return;
  }
  aplicarMarca();
  montarFiltros();
  $("pubLoading").style.display = "none";
  $("pubBody").style.display = "block";
  render();
}
function falha(t, d) {
  $("pubLoading").className = "";
  $("pubLoading").innerHTML = `<div class="card"><div class="cardBody"><div class="empty">
    <div class="glyph">😕</div><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div></div></div>`;
}
function aplicarMarca() {
  if (loja && loja.name) { $("pubLoja").textContent = loja.name; document.title = "Catálogo · " + loja.name; }
  if (loja && loja.logo) $("pubLogo").innerHTML = `<img src="${esc(loja.logo)}" alt="">`;
  if (vendedor && vendedor.nome) $("pubSub").textContent = "Atendimento com " + vendedor.nome;
}
function montarFiltros() {
  const cats = ["Todos", ...new Set(produtos.map((p) => p.categoria).filter(Boolean))];
  $("pubCat").innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join("");
}
function filtrados() {
  const t = busca.trim().toLowerCase();
  return produtos.filter((p) => {
    if (cat !== "Todos" && p.categoria !== cat) return false;
    if (t && !(p.nome || "").toLowerCase().includes(t) && !(p.desc || "").toLowerCase().includes(t)) return false;
    return true;
  }).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}
function render() {
  const ps = filtrados();
  const g = $("pubGrid");
  if (!ps.length) {
    g.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="glyph">🕶️</div>
      <div class="t">Nenhum modelo encontrado</div><div class="d">Tente outra busca ou categoria.</div></div>`;
    return;
  }
  g.innerHTML = ps.map((p) => {
    const dentro = lista.find((x) => x.id === p.id);
    return `<div class="prodCard">
      <div class="prodImg">${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy"/>` : `<div class="prodImgPlaceholder">🕶️</div>`}</div>
      <div class="prodInfo">
        <div class="prodCat">${esc(p.categoria || "")}</div>
        <div class="prodNome">${esc(p.nome)}</div>
        ${p.desc ? `<div class="prodDesc">${esc(p.desc)}</div>` : ""}
        <div class="prodPreco">${money(p.preco)}</div>
      </div>
      <div class="prodActs">
        <button class="btn ${dentro ? "go" : "primary"} sm" data-add="${esc(p.id)}" style="width:100%;justify-content:center">
          ${dentro ? "✓ Na lista" : "+ Adicionar"}</button>
      </div>
    </div>`;
  }).join("");
  badge();
}
function badge() {
  const b = $("pubBadge");
  b.textContent = lista.length;
  b.style.display = lista.length ? "inline-flex" : "none";
}
function alternar(id) {
  const p = produtos.find((x) => x.id === id); if (!p) return;
  const i = lista.findIndex((x) => x.id === id);
  if (i >= 0) lista.splice(i, 1); else lista.push({ id: p.id, nome: p.nome, preco: p.preco, qtd: 1 });
  render();
}
function renderLista() {
  if (!lista.length) { $("pubItens").innerHTML = `<div class="hint">Sua lista está vazia.</div>`; $("pubTotal").textContent = ""; return; }
  $("pubItens").innerHTML = `<table><tbody>
    ${lista.map((c, i) => `<tr>
      <td>${esc(c.nome)}</td>
      <td class="num"><input type="number" min="1" value="${c.qtd}" data-q="${i}"
        style="width:52px;padding:4px 6px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);text-align:center;font-family:inherit"/></td>
      <td class="num">${money(c.preco * c.qtd)}</td>
      <td><button class="btn ghost icon sm" data-r="${i}">✕</button></td></tr>`).join("")}
  </tbody></table>`;
  $("pubTotal").textContent = "Total: " + money(lista.reduce((s, c) => s + c.preco * c.qtd, 0));
}
function enviar() {
  if (!lista.length) { toast("Escolha ao menos um modelo."); return; }
  const nome = $("pubNome").value.trim();
  const total = lista.reduce((s, c) => s + c.preco * c.qtd, 0);
  const itens = lista.map((c) => `• ${c.nome} x${c.qtd} — ${money(c.preco * c.qtd)}`).join("\n");
  const saud = vendedor && vendedor.nome ? `Olá ${primeiroNome(vendedor.nome)}!` : "Olá!";
  const msg = `${saud}${nome ? ` Aqui é ${nome}.` : ""} Vi o catálogo${loja && loja.name ? ` da ${loja.name}` : ""} e me interessei por:\n\n${itens}\n\n*Total: ${money(total)}*`;
  const tel = (vendedor && (vendedor.whatsapp || vendedor.telefone)) || "";
  window.open(waLink(tel, msg), "_blank");
}
function wireEvents() {
  $("pubBusca").addEventListener("input", (e) => { busca = e.target.value; render(); });
  $("pubCat").addEventListener("change", (e) => { cat = e.target.value; render(); });
  $("pubGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-add]"); if (b) alternar(b.dataset.add); });
  $("pubCarrinho").addEventListener("click", () => { renderLista(); openModal("pubBack"); });
  $("pubLimpar").addEventListener("click", () => { lista = []; renderLista(); render(); });
  $("pubEnviar").addEventListener("click", enviar);
  $("pubBack").addEventListener("click", (e) => {
    const r = e.target.closest("[data-r]"); if (r) { lista.splice(+r.dataset.r, 1); renderLista(); render(); }
  });
  $("pubBack").addEventListener("change", (e) => {
    const q = e.target.closest("[data-q]");
    if (q) { lista[+q.dataset.q].qtd = Math.max(1, parseInt(e.target.value, 10) || 1); renderLista(); }
  });
}
