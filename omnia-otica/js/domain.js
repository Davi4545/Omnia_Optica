// ============================================================
// OMNIA Ótica — domínio (constantes e helpers de ótica)
// ============================================================
import { esc } from "./utils.js";

export const PRODUTOS = [
  "Óculos de grau", "Óculos de sol", "Armação", "Lente de grau",
  "Lente de contato", "Lente multifocal", "Acessório", "Conserto / ajuste"
];
export const TIPOS_LENTE = [
  "Não se aplica", "Visão simples", "Multifocal", "Bifocal", "Ocupacional", "Sol / sem grau"
];
export const TRATAMENTOS = [
  "Sem tratamento", "Antirreflexo", "Filtro de luz azul", "Fotossensível (Transitions)", "Polarizada"
];
export const MOTIVOS_NAO = [
  "Só queria orçamento", "Vai voltar com a receita", "Achou caro / vai pensar",
  "Não tinha o modelo/armação", "Não cobre pelo convênio", "Comparando preço",
  "Indeciso / volta depois", "Outro"
];
export const GENEROS = ["Feminino", "Masculino", "Unissex", "Infantil"];

export const MATERIAIS = ["Resina (CR-39)", "Policarbonato", "Trivex", "1.59", "1.60", "1.67", "1.74", "Cristal"];
export const TIPOS_LENTE_OS = ["Visão simples", "Multifocal", "Bifocal", "Ocupacional"];
export const TRAT_LENTE = ["Antirreflexo", "Filtro de luz azul", "Fotossensível (Transitions)", "Polarizada", "Coloração", "Hidrofóbica"];

export const OS_STATUS = [
  { k: "aberta",   n: "Aberta",         cor: "var(--ink-faint)" },
  { k: "enviada",  n: "No laboratório", cor: "var(--iris)" },
  { k: "producao", n: "Em produção",    cor: "var(--amber)" },
  { k: "recebida", n: "Recebida",       cor: "#4d7cff" },
  { k: "montada",  n: "Montada",        cor: "var(--go)" },
  { k: "entregue", n: "Entregue",       cor: "var(--go-ink)" }
];
export const statusInfo    = (k) => OS_STATUS.find((s) => s.k === k) || OS_STATUS[0];
export const proximoStatus = (k) => { const i = OS_STATUS.findIndex((s) => s.k === k); return i >= 0 && i < OS_STATUS.length - 1 ? OS_STATUS[i + 1].k : null; };
export const osNumero      = (n) => "OS-" + String(n || 0).padStart(4, "0");

export function fmtGrau(v) {
  if (v === "" || v == null) return "";
  const n = Number(v); if (isNaN(n)) return "";
  return (n > 0 ? "+" : "") + n.toFixed(2).replace(".", ",");
}
export function rxResumo(rx) {
  if (!rx || !rx.od) return "Sem receita";
  const eye = (e) => {
    let s = fmtGrau(e.esf) || "0,00";
    const cil = fmtGrau(e.cil);
    if (cil && Number(e.cil) !== 0) { s += " " + cil; if (e.eixo !== "" && e.eixo != null) s += " " + e.eixo + "°"; }
    return s;
  };
  let s = "OD " + eye(rx.od) + "  ·  OE " + eye(rx.oe);
  const add = rx.od.add || rx.oe.add;
  if (add && Number(add) > 0) s += "  ·  Ad " + fmtGrau(add);
  return s;
}

// preenche um <select> a partir de uma lista
export function options(list, selected) {
  return list.map((o) => `<option${o === selected ? " selected" : ""}>${esc(o)}</option>`).join("");
}

// selos de ótica (gamificação)
export const SELOS = [
  { ic: "🌙", st: "Meta do mês",           sd: "Bater a meta mensal individual",     test: (a, d, g) => g > 0 && a.fat >= g },
  { ic: "👑", st: "Rei da conversão",       sd: "Conversão ≥ 70% (mín. 5 atend.)",    test: (a) => a.atend >= 5 && a.conv >= 70 },
  { ic: "🥇", st: "Especialista multifocal", sd: "5+ multifocais no mês",             test: (a, d) => d.multi >= 5 },
  { ic: "🔥", st: "Combo armação+lente",    sd: "10+ vendas com 2 itens ou mais",     test: (a, d) => d.combos >= 10 },
  { ic: "💼", st: "Ticket alto",            sd: "Ticket médio ≥ R$ 800",              test: (a) => a.tm >= 800 },
  { ic: "💎", st: "Venda premium",          sd: "Uma venda ≥ R$ 2.500",               test: (a, d) => d.maior >= 2500 },
  { ic: "🧩", st: "P.A. de respeito",       sd: "Itens por venda ≥ 1,8",              test: (a) => a.pa >= 1.8 }
];

// agrega registros (vendas)
export function agg(rs) {
  let atend = rs.length, vendas = 0, fat = 0, itens = 0;
  for (const r of rs) if (r.resultado === "vendeu") { vendas++; fat += Number(r.valor || 0); itens += Number(r.itens || 0); }
  return { atend, vendas, fat, itens, conv: atend ? vendas / atend * 100 : 0, tm: vendas ? fat / vendas : 0, pa: vendas ? itens / vendas : 0 };
}
