// ============================================================
// OMNIA Ótica — utilitários compartilhados
// Correções de base: escape (XSS), datas LOCAIS, imagem comprimida.
// ============================================================

export const $  = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Escapa HTML — nunca injeta markup do usuário
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Datas SEMPRE em horário local (evita o bug pós-21h que virava o dia)
export function dateKey(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function monthKey(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
export function hhmm(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
export function fmtData(iso) {
  if (!iso) return "—";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

export const uid   = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
export const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num   = (n) => Number(n || 0).toLocaleString("pt-BR");
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// "1.890,00" -> 1890.0
export function brNum(s) {
  if (typeof s === "number") return s;
  s = (s || "").toString().trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export function primeiroNome(n) { return (n || "").trim().split(" ")[0] || ""; }

// Comprime imagem no navegador (evita base64 gigante que estoura o documento)
export function comprimirImagem(file, max = 384, q = 0.8) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > max) { w = Math.round(w * max / h); h = max; }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", q));
      };
      img.onerror = rej; img.src = e.target.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

// Compressão para FOTO DE DOCUMENTO (receita).
// Diferente da foto de perfil: precisa manter os números legíveis, então usa
// resolução maior. Reduz a qualidade em passos até caber no limite pedido —
// o documento do Firestore aceita no máximo 1 MB, e base64 cresce ~33%.
export function comprimirDocumento(file, maxLado = 1400, limiteBytes = 700 * 1024) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxLado) { h = Math.round(h * maxLado / w); w = maxLado; }
        else if (h > maxLado) { w = Math.round(w * maxLado / h); h = maxLado; }
        const c = document.createElement("canvas");
        const desenha = (lw, lh) => {
          c.width = lw; c.height = lh;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, lw, lh); // fundo branco p/ PNG transparente
          ctx.drawImage(img, 0, 0, lw, lh);
        };
        desenha(w, h);
        let q = 0.82, out = c.toDataURL("image/jpeg", q);
        // baixa a qualidade e, se preciso, a resolução, até caber
        while (out.length > limiteBytes && q > 0.4) { q -= 0.08; out = c.toDataURL("image/jpeg", q); }
        while (out.length > limiteBytes && w > 700) {
          w = Math.round(w * 0.85); h = Math.round(h * 0.85);
          desenha(w, h); q = 0.7; out = c.toDataURL("image/jpeg", q);
        }
        if (out.length > limiteBytes) { rej(new Error("imagem grande demais")); return; }
        res({ dataUrl: out, largura: w, altura: h, bytes: out.length });
      };
      img.onerror = () => rej(new Error("arquivo não é uma imagem"));
      img.src = e.target.result;
    };
    r.onerror = () => rej(new Error("falha ao ler o arquivo"));
    r.readAsDataURL(file);
  });
}

// Abre uma imagem em nova aba (visualizar receita anexada)
export function abrirImagem(dataUrl) {
  const w = window.open("");
  if (!w) { toast("Permita as janelas pop-up para ver a imagem."); return; }
  w.document.write(`<title>Receita</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh">
    <img src="${dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain">`);
  w.document.close();
}

// Formata bytes de forma legível
export const tamanhoLegivel = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB";

// Toast (cria o elemento se não existir)
let toastEl = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

// Modais
export function openModal(id) { const m = $(id); if (m) m.classList.add("show"); }
export function closeModal(id) { const m = $(id); if (m) m.classList.remove("show"); }
export function wireModals() {
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  $$(".modalBack").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modalBack.show").forEach((m) => closeModal(m.id));
  });
}

// WhatsApp
export function waLink(tel, texto) {
  const n = (tel || "").replace(/\D/g, "");
  const msg = encodeURIComponent(texto || "");
  return n ? `https://wa.me/55${n}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

// Download de arquivo (CSV etc.)
export function downloadBlob(content, filename, type = "text/csv;charset=utf-8;") {
  const blob = new Blob(["\ufeff" + content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// Substitui o "carregando" por uma falha explicada, em vez de girar para sempre.
export function mostrarFalha(titulo, detalhe) {
  const load = $("loading");
  if (load) {
    load.className = "";
    load.innerHTML = `<div class="card"><div class="cardBody"><div class="empty">
      <div class="glyph">\u26a0\ufe0f</div><div class="t">${esc(titulo)}</div>
      <div class="d">${esc(detalhe || "")}</div>
      <button class="btn ghost sm" style="margin-top:14px" id="btnTentarDeNovo">Tentar de novo</button>
    </div></div></div>`;
    load.style.display = "block";
    const b = $("btnTentarDeNovo");
    if (b) b.addEventListener("click", () => location.reload());
  }
  const body = $("appBody");
  if (body) body.style.display = "none";
}
