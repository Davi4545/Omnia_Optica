import { initShell } from "./session.js";
import { subscribeProdutos, saveProduto, deleteProduto } from "./db.js";
import {
  $, esc, uid, money, brNum, num, toast,
  openModal, closeModal, wireModals, comprimirImagem, waLink
} from "./utils.js";
import { PRODUTOS } from "./domain.js";

const CATS = ["Todos", ...PRODUTOS];

let CTX, STORE, STORE_NAME, PODE_EDITAR = false;
let produtos = [], cart = [], busca = "", catFiltro = "Todos";
let fotoTemp = "";

init();
async function init() {
  CTX = await initShell("catalogo");
  STORE = CTX.storeId;
  STORE_NAME = (CTX.store && CTX.store.name) || "Ótica";
  // As regras do Firestore só permitem gestor escrever em /produtos.
  // Escondemos os controles para o vendedor não bater numa falha silenciosa.
  PODE_EDITAR = !!CTX.isAdmin;
  if (!PODE_EDITAR) $("btnNovoProd").style.display = "none";
  wireModals();
  wireEvents();
  // preenche selects fixos
  $("prod_cat").innerHTML = PRODUTOS.map((c) => `<option>${esc(c)}</option>`).join("");
  $("prodCat").innerHTML = CATS.map((c) => `<option>${esc(c)}</option>`).join("");
  subscribeProdutos(STORE, (list) => { produtos = list; reveal(); render(); });
}
function reveal() { $("loading").style.display = "none"; $("appBody").style.display = "block"; }

/* ---------- render ---------- */
function filtered() {
  const term = busca.trim().toLowerCase();
  return produtos.filter((p) => {
    if (!p.ativo) return false;
    if (catFiltro !== "Todos" && p.categoria !== catFiltro) return false;
    if (term && !p.nome.toLowerCase().includes(term) && !(p.desc || "").toLowerCase().includes(term)) return false;
    return true;
  }).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}
function render() {
  const list = filtered();
  const grid = $("prodGrid");
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="glyph">🕶️</div><div class="t">Nenhum produto encontrado</div><div class="d">Adicione produtos ao catálogo clicando em "+ Produto".</div></div>`;
    return;
  }
  grid.innerHTML = list.map((p) => {
    const inCart = cart.find((c) => c.id === p.id);
    return `<div class="prodCard" data-pid="${esc(p.id)}">
      <div class="prodImg">${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}"/>` : `<div class="prodImgPlaceholder">🕶️</div>`}</div>
      <div class="prodInfo">
        <div class="prodCat">${esc(p.categoria || "")}</div>
        <div class="prodNome">${esc(p.nome)}</div>
        ${p.desc ? `<div class="prodDesc">${esc(p.desc)}</div>` : ""}
        <div class="prodPreco">${money(p.preco)}</div>
        ${p.estoque != null ? `<div class="prodEst hint">${p.estoque > 0 ? `${p.estoque} em estoque` : `<span style="color:var(--stop)">Sem estoque</span>`}</div>` : ""}
      </div>
      <div class="prodActs">
        ${PODE_EDITAR ? `<button class="btn ghost sm icon" data-edit="${esc(p.id)}" title="Editar">✎</button>` : ""}
        <button class="btn ${inCart ? "go" : "primary"} sm" data-cart="${esc(p.id)}">${inCart ? "✓ No carrinho" : "+ Carrinho"}</button>
      </div>
    </div>`;
  }).join("");
  updateCartBadge();
}

/* ---------- carrinho ---------- */
function updateCartBadge() {
  const badge = $("cartBadge");
  badge.textContent = cart.length;
  badge.style.display = cart.length ? "inline-flex" : "none";
}
function toggleCart(pid) {
  const p = produtos.find((x) => x.id === pid); if (!p) return;
  const idx = cart.findIndex((c) => c.id === pid);
  if (idx >= 0) cart.splice(idx, 1); else cart.push({ id: p.id, nome: p.nome, preco: p.preco, qtd: 1 });
  render();
}
function renderCartItems() {
  if (!cart.length) { $("cartItems").innerHTML = `<div class="hint">Carrinho vazio.</div>`; $("cartTotal").textContent = ""; return; }
  $("cartItems").innerHTML = `<table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Preço</th><th></th></tr></thead><tbody>
    ${cart.map((c, i) => `<tr>
      <td>${esc(c.nome)}</td>
      <td class="num"><input type="number" min="1" value="${c.qtd}" style="width:52px;padding:4px 6px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);text-align:center;font-family:inherit" data-cartqtd="${i}"/></td>
      <td class="num">${money(c.preco * c.qtd)}</td>
      <td><button class="btn ghost icon sm" data-cartrem="${i}">✕</button></td>
    </tr>`).join("")}
  </tbody></table>`;
  const total = cart.reduce((s, c) => s + c.preco * c.qtd, 0);
  $("cartTotal").textContent = `Total: ${money(total)}`;
}
function enviarWa() {
  if (!cart.length) { toast("Carrinho vazio."); return; }
  const cli = $("cart_cli").value.trim(), tel = $("cart_tel").value.trim();
  const total = cart.reduce((s, c) => s + c.preco * c.qtd, 0);
  const linhas = cart.map((c) => `• ${c.nome} x${c.qtd} — ${money(c.preco * c.qtd)}`).join("\n");
  const msg = `Olá${cli ? " " + cli : ""}! Segue o pedido da ${STORE_NAME}:\n\n${linhas}\n\n*Total: ${money(total)}*`;
  window.open(waLink(tel, msg), "_blank");
}

/* ---------- modal produto ---------- */
function abrir(id) {
  fotoTemp = "";
  const p = id ? produtos.find((x) => x.id === id) : null;
  const set = (k, v) => { const el = $(k); if (el) el.value = v == null ? "" : v; };
  $("prodTitle").textContent = p ? "Editar produto" : "Novo produto";
  if (p) {
    set("prod_id", p.id); set("prod_nome", p.nome); set("prod_desc", p.desc || "");
    $("prod_cat").value = p.categoria || PRODUTOS[0];
    set("prod_preco", p.preco ? String(p.preco).replace(".", ",") : "");
    set("prod_estoque", p.estoque ?? "");
    $("prod_ativo").checked = p.ativo !== false;
    fotoTemp = p.foto || "";
    const prev = $("prod_foto_prev");
    if (fotoTemp) { prev.src = fotoTemp; prev.style.display = "block"; } else prev.style.display = "none";
    $("btnDeleteProd").style.display = "inline-flex";
  } else {
    ["prod_id", "prod_nome", "prod_desc", "prod_preco", "prod_estoque"].forEach((k) => set(k, ""));
    $("prod_cat").value = PRODUTOS[0]; $("prod_ativo").checked = true;
    $("prod_foto_prev").style.display = "none";
    $("btnDeleteProd").style.display = "none";
  }
  $("prod_foto_inp").value = "";
  openModal("prodBack");
}
async function salvar() {
  const nome = $("prod_nome").value.trim(); if (!nome) { toast("Digite o nome do produto."); return; }
  const id = $("prod_id").value;
  const dados = {
    nome, categoria: $("prod_cat").value, desc: $("prod_desc").value.trim(),
    preco: brNum($("prod_preco").value),
    estoque: $("prod_estoque").value !== "" ? parseInt($("prod_estoque").value, 10) : null,
    ativo: $("prod_ativo").checked, foto: fotoTemp, atualizadoEm: Date.now()
  };
  const p = id ? { ...(produtos.find((x) => x.id === id) || { id }), ...dados } : { id: "prod_" + uid(), criadoEm: Date.now(), ...dados };
  try { await saveProduto(STORE, p); } catch (e) { toast("Falha ao salvar."); return; }
  closeModal("prodBack"); toast("Produto salvo ✓");
}
async function excluir() {
  const id = $("prod_id").value; if (!id) return;
  if (!confirm("Excluir este produto?")) return;
  try { await deleteProduto(STORE, id); } catch (e) { toast("Falha ao excluir."); return; }
  closeModal("prodBack"); toast("Produto excluído.");
}

/* ---------- eventos ---------- */
function wireEvents() {
  $("prodSearch").addEventListener("input", (e) => { busca = e.target.value; render(); });
  $("prodCat").addEventListener("change", (e) => { catFiltro = e.target.value; render(); });
  $("btnNovoProd").addEventListener("click", () => abrir(null));
  $("btnSaveProd").addEventListener("click", salvar);
  $("btnDeleteProd").addEventListener("click", excluir);
  $("prod_foto_inp").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { fotoTemp = await comprimirImagem(f); const p = $("prod_foto_prev"); p.src = fotoTemp; p.style.display = "block"; }
    catch (_) { toast("Não deu para ler a imagem."); }
  });

  $("prodGrid").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) { e.stopPropagation(); abrir(ed.dataset.edit); return; }
    const ca = e.target.closest("[data-cart]"); if (ca) { e.stopPropagation(); toggleCart(ca.dataset.cart); return; }
  });

  $("btnCarrinho").addEventListener("click", () => { renderCartItems(); openModal("cartBack"); });
  $("btnLimparCart").addEventListener("click", () => { cart = []; renderCartItems(); updateCartBadge(); });
  $("btnEnviarWa").addEventListener("click", enviarWa);

  // qtd e remove dentro do modal do carrinho
  document.getElementById("cartBack").addEventListener("click", (e) => {
    const rem = e.target.closest("[data-cartrem]");
    if (rem) { cart.splice(+rem.dataset.cartrem, 1); renderCartItems(); updateCartBadge(); return; }
  });
  document.getElementById("cartBack").addEventListener("change", (e) => {
    const qtd = e.target.closest("[data-cartqtd]");
    if (qtd) { const v = Math.max(1, parseInt(e.target.value, 10) || 1); cart[+qtd.dataset.cartqtd].qtd = v; renderCartItems(); }
  });
}
