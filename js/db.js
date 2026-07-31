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

// Busca a loja por código com UM get pontual em /storeCodes/{code}.
// Nunca lista a coleção de lojas (evita vazamento e respeita as regras).
export async function findStoreByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const map = await getDoc(doc(db, "storeCodes", c));
  if (!map.exists()) return null;
  const storeId = map.data().storeId;
  if (!storeId) return null;
  return { id: storeId, ...(map.data().store || {}) };
}

// Registra/atualiza o código de acesso de uma loja (gestor).
export async function setStoreCode(code, storeId, storeName) {
  const c = normalizeCode(code);
  if (!c) throw new Error("Código inválido");
  await setDoc(doc(db, "storeCodes", c), { storeId, store: { name: storeName || "" } }, { merge: true });
  return c;
}
export async function deleteStoreCode(code) {
  const c = normalizeCode(code);
  if (c) await deleteDoc(doc(db, "storeCodes", c));
}

// ---------- tratamento de falha nas assinaturas ----------
// Sem isto, uma leitura negada pelas regras faz o onSnapshot falhar em silêncio:
// o callback de sucesso nunca roda e a tela fica presa no "carregando".
function erroDados(origem, e) {
  console.error("Firestore [" + origem + "]:", e);
  try {
    window.dispatchEvent(new CustomEvent("omnia:erro-dados", {
      detail: { origem, code: (e && e.code) || "", message: (e && e.message) || "" }
    }));
  } catch (_) { /* ambiente sem window */ }
}

// ---------- ESTADO OPERACIONAL (app/state) ----------
const stateRef = (storeId) => doc(db, "stores", storeId, "app", "state");
export function subscribeState(storeId, cb) {
  return onSnapshot(stateRef(storeId),
    (snap) => cb(snap.exists() ? snap.data() : null),
    (e) => erroDados("app/state", e));
}
export async function saveState(storeId, stateObj) {
  await setDoc(stateRef(storeId), { ...stateObj, _updatedAt: Date.now() }, { merge: false });
}

// ---------- coleção genérica ----------
const col = (storeId, name) => collection(db, "stores", storeId, name);
function subscribeCol(storeId, name, cb) {
  return onSnapshot(col(storeId, name),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => erroDados(name, e));
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

// ---------- OS DE LABORATÓRIO (novo) ----------
export const subscribeOS = (s, cb) => subscribeCol(s, "os", cb);
export const saveOS   = (s, o)  => saveDoc(s, "os", o.id, o);
export const deleteOS = (s, id) => removeDoc(s, "os", id);

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

// ---------- CONTATO PÚBLICO DO VENDEDOR ----------
export async function saveVendedorPublico(storeId, uid, data) {
  await setDoc(doc(db, "stores", storeId, "vendedores", uid), data, { merge: true });
}
export async function getVendedorPublico(storeId, uid) {
  const s = await getDoc(doc(db, "stores", storeId, "vendedores", uid));
  return s.exists() ? s.data() : null;
}
