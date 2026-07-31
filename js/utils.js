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
