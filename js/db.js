// ============================================================
// OMNIA Ótica — camada de dados (Firestore)
// Mantém o schema atual: stores/{id}/{app,records,clientes,ponto,
// produtos,comissaoConfig,vendedores} + os (novo) + users.
// ============================================================
import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------- USUÁRIOS ----------
export async function getUserProfile(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}
export async function createUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), { role: "seller", active: true, ...data }, { merge: true });
}
export async function updateUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}
// Lista usuários de UMA loja (a consulta precisa filtrar para passar nas regras)
export async function listUsersByStore(storeId) {
  const qs = await getDocs(query(collection(db, "users"), where("storeId", "==", storeId)));
  return qs.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Atualiza dados da loja (nome, código, logo) — usado pelo painel de gestão
export async function updateStore(storeId, data) {
  await setDoc(doc(db, "stores", storeId), data, { merge: true });
}

// Lista TODOS os usuários — apenas super admin passa nas regras.
// Usado para localizar alguém que ainda está em outra ótica.
export async function listAllUsers() {
  const qs = await getDocs(collection(db, "users"));
  return qs.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Cria uma loja (apenas super admin, conforme as regras)
export async function createStore(storeId, data) {
  await setDoc(doc(db, "stores", storeId), data, { merge: true });
  return { id: storeId, ...data };
}

// ---------- LOJAS (ÓTICAS) ----------
export async function getStore(storeId) {
  const s = await getDoc(doc(db, "stores", storeId));
  return s.exists() ? { id: storeId, ...s.data() } : null;
}
export async function listStores() {
  const q = await getDocs(collection(db, "stores"));
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// Normaliza o código: minúsculas, sem espaços/acentos — vira o ID do documento.
export function normalizeCode(code) {
  return (code || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}

// Busca a loja pelo código de acesso.
// 1º) tenta o índice /storeCodes (um get pontual, não vaza a lista de lojas)
// 2º) se ele não existir ou estiver bloqueado, procura na coleção /stores
// Assim o cadastro funciona tanto com as regras novas quanto com as antigas.
export async function findStoreByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  try {
    const map = await getDoc(doc(db, "storeCodes", c));
    if (map.exists() && map.data().storeId) {
      return { id: map.data().storeId, ...(map.data().store || {}) };
    }
  } catch (_) { /* índice ausente ou bloqueado: usa o caminho abaixo */ }
  try {
    const stores = await listStores();
    return stores.find((s) => normalizeCode(s.code) === c) || null;
  } catch (_) { return null; }
}

// Registra/atualiza o código de acesso de uma loja (gestor).
// O índice /storeCodes é um extra. Se as regras não o permitirem, seguimos
// em frente: o código também fica no campo "code" do documento da loja.
export async function setStoreCode(code, storeId, storeName) {
  const c = normalizeCode(code);
  if (!c) throw new Error("Código inválido");
  try {
    await setDoc(doc(db, "storeCodes", c), { storeId, store: { name: storeName || "" } }, { merge: true });
  } catch (_) { /* opcional */ }
  return c;
}
export async function deleteStoreCode(code) {
  const c = normalizeCode(code);
  if (!c) return;
  try { await deleteDoc(doc(db, "storeCodes", c)); } catch (_) { /* opcional */ }
}

// ---------- tratamento de falha nas assinaturas ----------
// Sem isto, uma leitura negada pelas regras faz o onSnapshot falhar em silêncio:
// o callback de sucesso nunca roda e a tela fica presa no "carregando".
function erroDados(origem, e, storeId) {
  console.error("Firestore [" + origem + "] loja=" + storeId + ":", e);
  try {
    window.dispatchEvent(new CustomEvent("omnia:erro-dados", {
      detail: { origem, storeId: storeId || "", code: (e && e.code) || "", message: (e && e.message) || "" }
    }));
  } catch (_) { /* ambiente sem window */ }
}

// ---------- ESTADO OPERACIONAL (app/state) ----------
const stateRef = (storeId) => doc(db, "stores", storeId, "app", "state");
export function subscribeState(storeId, cb) {
  return onSnapshot(stateRef(storeId),
    (snap) => cb(snap.exists() ? snap.data() : null),
    (e) => erroDados("app/state", e, storeId));
}
export async function saveState(storeId, stateObj) {
  await setDoc(stateRef(storeId), { ...stateObj, _updatedAt: Date.now() }, { merge: false });
}

// ---------- coleção genérica ----------
const col = (storeId, name) => collection(db, "stores", storeId, name);
function subscribeCol(storeId, name, cb) {
  return onSnapshot(col(storeId, name),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => erroDados(name, e, storeId));
}
async function saveDoc(storeId, name, id, data) {
  await setDoc(doc(db, "stores", storeId, name, id), data, { merge: true });
}
async function removeDoc(storeId, name, id) {
  await deleteDoc(doc(db, "stores", storeId, name, id));
}

// ---------- RECORDS (vendas/atendimentos) ----------
export const subscribeRecords = (s, cb) => subscribeCol(s, "records", cb);
export const addRecord    = (s, rec)    => saveDoc(s, "records", rec.id, rec);
export const deleteRecord = (s, id)     => removeDoc(s, "records", id);

// ---------- CLIENTES (CRM) ----------
export const subscribeClientes = (s, cb) => subscribeCol(s, "clientes", cb);
export const saveCliente   = (s, c)  => saveDoc(s, "clientes", c.id, c);
export const deleteCliente = (s, id) => removeDoc(s, "clientes", id);

// ---------- OS DE LABORATÓRIO ----------
// As ordens de serviço ficam na coleção "app", com id prefixado por "os_".
// Motivo: "app" já é liberada por qualquer versão das regras (antiga ou nova),
// então o Laboratório funciona sem depender de republicar regra nenhuma.
// O documento app/state (estado operacional) é ignorado pelo filtro abaixo.
const COL_OS = "app";
const PREFIXO_OS = "os_";
const ehDocOS = (d) => d && typeof d.id === "string" && d.id.startsWith(PREFIXO_OS);

export function subscribeOS(storeId, cb) {
  return onSnapshot(col(storeId, COL_OS),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ehDocOS)),
    (e) => erroDados("os", e, storeId));
}
export const saveOS = (s, o) => {
  const id = String(o.id || "").startsWith(PREFIXO_OS) ? o.id : PREFIXO_OS + (o.id || Math.random().toString(16).slice(2));
  return saveDoc(s, COL_OS, id, { ...o, id });
};
export const deleteOS = (s, id) => removeDoc(s, COL_OS, id);

// ---------- PONTO ----------
export const subscribePonto = (s, cb) => subscribeCol(s, "ponto", cb);
export const savePonto = (s, p) => saveDoc(s, "ponto", p.id, p);

// ---------- PRODUTOS (catálogo) ----------
export const subscribeProdutos = (s, cb) => subscribeCol(s, "produtos", cb);
export const saveProduto   = (s, p)  => saveDoc(s, "produtos", p.id, p);
export const deleteProduto = (s, id) => removeDoc(s, "produtos", id);
export async function listProdutos(storeId) {
  const q = await getDocs(col(storeId, "produtos"));
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- COMISSÃO (faixas) ----------
export async function getFaixas(storeId) {
  const s = await getDoc(doc(db, "stores", storeId, "comissaoConfig", "faixas"));
  return s.exists() ? (s.data().faixas || []) : null;
}
export async function saveFaixas(storeId, faixas) {
  await setDoc(doc(db, "stores", storeId, "comissaoConfig", "faixas"), { faixas }, { merge: true });
}

// ---------- CATÁLOGO PÚBLICO (cliente, sem login) ----------
// Exige "allow read: if true" em /produtos e /vendedores nas regras.
export async function getProdutosPublico(storeId) {
  const qs = await getDocs(col(storeId, "produtos"));
  return qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false);
}
export async function getLojaPublica(storeId) {
  const s = await getDoc(doc(db, "stores", storeId));
  return s.exists() ? { id: storeId, name: s.data().name || "", logo: s.data().logo || "" } : null;
}

// ---------- EXCLUSÕES ----------
// Excluir o perfil do usuário. IMPORTANTE: isto NÃO remove a credencial do
// Firebase Auth — a pessoa ainda consegue autenticar, só fica sem perfil.
// Por isso a interface desativa antes de excluir.
export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, "users", uid));
}

// O Firestore NÃO apaga subcoleções junto com o documento pai.
// Sem isto, apagar a loja deixaria vendas, clientes e OS órfãos no banco,
// invisíveis na interface mas ocupando espaço e ainda legíveis pela API.
export async function excluirLojaCompleta(storeId, aoProgredir) {
  const partes = ["app", "records", "clientes", "ponto", "pontoConfig",
                  "produtos", "comissaoConfig", "vendedores"];
  let apagados = 0, falhas = 0;
  for (const nome of partes) {
    if (aoProgredir) aoProgredir(nome);
    try {
      const qs = await getDocs(col(storeId, nome));
      for (const d of qs.docs) {
        try { await deleteDoc(d.ref); apagados++; } catch (_) { falhas++; }
      }
    } catch (_) { falhas++; }
  }
  if (aoProgredir) aoProgredir("a ótica");
  await deleteDoc(doc(db, "stores", storeId));
  return { apagados, falhas };
}

// ---------- BACKUP ----------
// Lê tudo de uma loja para exportação. Usado no painel de gestão.
export async function exportarLoja(storeId) {
  const nomes = ["records", "clientes", "ponto", "produtos", "vendedores"];
  const dump = { loja: null, estado: null, comissao: null, geradoEm: new Date().toISOString(), storeId };
  try { dump.loja = await getStore(storeId); } catch (_) {}
  try {
    const st = await getDoc(stateRef(storeId));
    dump.estado = st.exists() ? st.data() : null;
  } catch (_) {}
  try { dump.comissao = await getFaixas(storeId); } catch (_) {}
  for (const n of nomes) {
    try {
      const qs = await getDocs(col(storeId, n));
      dump[n] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) { dump[n] = { erro: (e && e.code) || "falha na leitura" }; }
  }
  // OS vivem em app/ com prefixo os_
  try {
    const qs = await getDocs(col(storeId, COL_OS));
    dump.os = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ehDocOS);
  } catch (e) { dump.os = { erro: (e && e.code) || "falha na leitura" }; }
  return dump;
}

// ---------- CONTATO PÚBLICO DO VENDEDOR ----------
export async function saveVendedorPublico(storeId, uid, data) {
  await setDoc(doc(db, "stores", storeId, "vendedores", uid), data, { merge: true });
}
export async function getVendedorPublico(storeId, uid) {
  const s = await getDoc(doc(db, "stores", storeId, "vendedores", uid));
  return s.exists() ? s.data() : null;
}
