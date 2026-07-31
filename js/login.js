import { auth } from "./firebase.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, deleteUser, signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { findStoreByCode, createUserProfile } from "./db.js";
import { $, esc } from "./utils.js";

let ocupado = false;

function msg(text, tipo) {
  const el = $("authMsg");
  const cor = tipo === "ok" ? "var(--go)" : tipo === "info" ? "var(--ink-soft)" : "var(--stop)";
  el.innerHTML = `<span style="color:${cor}">${esc(text)}</span>`;
}
function go() { location.replace("index.html"); }
function trava(v) {
  ocupado = v;
  ["btnLogin", "btnSignup"].forEach((id) => { const b = $(id); if (b) b.disabled = v; });
}

// Link de convite: login.html?code=visaoclara já abre em "Criar conta"
(function convite() {
  const code = new URLSearchParams(location.search).get("code");
  if (!code) return;
  $("su_code").value = code;
  $("tabSignup").classList.add("active"); $("tabLogin").classList.remove("active");
  $("formSignup").style.display = "block"; $("formLogin").style.display = "none";
  msg("Convite reconhecido. Preencha seus dados para criar a conta.", "ok");
  setTimeout(() => $("su_nome").focus(), 100);
})();

// Se já está logado, entra direto
onAuthStateChanged(auth, (u) => { if (u && !ocupado) go(); });

$("tabLogin").addEventListener("click", () => {
  $("tabLogin").classList.add("active"); $("tabSignup").classList.remove("active");
  $("formLogin").style.display = "block"; $("formSignup").style.display = "none"; msg("");
});
$("tabSignup").addEventListener("click", () => {
  $("tabSignup").classList.add("active"); $("tabLogin").classList.remove("active");
  $("formSignup").style.display = "block"; $("formLogin").style.display = "none"; msg("");
});

// ---------- entrar ----------
async function entrar() {
  if (ocupado) return;
  const email = $("li_email").value.trim(), pass = $("li_pass").value;
  if (!email || !pass) { msg("Preencha e-mail e senha."); return; }
  trava(true); msg("Entrando…", "info");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    go();
  } catch (e) { msg(traduzErro(e)); trava(false); }
}

// ---------- criar conta ----------
// ORDEM CORRETA: autentica primeiro, depois consulta o código da loja.
// A leitura de /storeCodes exige usuário autenticado — fazer o contrário
// sempre falharia. Se o código for inválido, desfazemos a conta criada.
async function criarConta() {
  if (ocupado) return;
  const nome = $("su_nome").value.trim(), email = $("su_email").value.trim();
  const pass = $("su_pass").value, code = $("su_code").value.trim();
  if (!nome || !email || !pass || !code) { msg("Preencha todos os campos."); return; }
  if (pass.length < 6) { msg("A senha precisa ter ao menos 6 caracteres."); return; }

  trava(true); msg("Criando sua conta…", "info");
  let cred = null;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, pass);

    msg("Verificando o código da ótica…", "info");
    const store = await findStoreByCode(code);
    if (!store) {
      // rollback: remove a conta recém-criada para não deixar órfã
      try { await deleteUser(cred.user); } catch (_) { await signOut(auth); }
      msg("Código da ótica não encontrado. Confira com o gestor.");
      trava(false);
      return;
    }

    await createUserProfile(cred.user.uid, {
      name: nome, email, role: "seller", storeId: store.id, active: true
    });
    go();
  } catch (e) {
    // se a conta foi criada mas o perfil falhou, não deixa sessão inconsistente
    if (cred && cred.user) { try { await deleteUser(cred.user); } catch (_) { await signOut(auth); } }
    msg(traduzErro(e));
    trava(false);
  }
}

// ---------- esqueci a senha ----------
async function recuperar() {
  const email = $("li_email").value.trim();
  if (!email) { msg("Digite seu e-mail acima para receber o link."); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    msg("Enviamos um link de redefinição para o seu e-mail.", "ok");
  } catch (e) { msg(traduzErro(e)); }
}

$("btnLogin").addEventListener("click", entrar);
$("btnSignup").addEventListener("click", criarConta);
$("btnForgot").addEventListener("click", recuperar);

// Enter envia o formulário visível
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if ($("formLogin").style.display !== "none") entrar(); else criarConta();
});

function traduzErro(e) {
  const c = (e && e.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "E-mail ou senha incorretos.";
  if (c.includes("email-already-in-use")) return "Esse e-mail já tem conta. Use ‘Entrar’.";
  if (c.includes("weak-password"))        return "Senha muito curta (mínimo 6 caracteres).";
  if (c.includes("invalid-email"))        return "E-mail inválido.";
  if (c.includes("too-many-requests"))    return "Muitas tentativas. Aguarde um instante.";
  if (c.includes("network-request-failed"))return "Sem conexão. Verifique a internet.";
  if (c.includes("permission-denied"))    return "Sem permissão. Verifique as regras do Firestore.";
  return "Não foi possível concluir. Tente novamente.";
}
