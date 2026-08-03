// ============================================================
// OMNIA Ótica — inicialização do Firebase
//
// ATENÇÃO: este arquivo define QUAL banco o sistema usa.
// Deve apontar para o projeto EXCLUSIVO da ótica (omnia-oticas),
// nunca para o projeto da rede de roupas (omnia-3b32b).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ------------------------------------------------------------
// COLE AQUI a configuração do projeto "Omnia Oticas".
// Console do Firebase → projeto Omnia Oticas → ⚙️ Configurações do projeto
// → Seus apps → Configuração do SDK.
// Se não existir um app Web lá, clique em "Adicionar app" → Web primeiro.
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "omnia-oticas.firebaseapp.com",
  projectId: "omnia-oticas",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

// Trava de segurança: impede o sistema de voltar a gravar no banco das roupas.
const PROJETO_PROIBIDO = "omnia-3b32b";
if (firebaseConfig.projectId === PROJETO_PROIBIDO) {
  const aviso = "O OMNIA Ótica está apontando para o projeto da rede de roupas (" +
    PROJETO_PROIBIDO + "). Troque o firebaseConfig em js/firebase.js pelo projeto omnia-oticas.";
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = '<div style="font-family:system-ui;max-width:540px;margin:12vh auto;padding:24px;' +
      'border:2px solid #d33;border-radius:14px;color:#d33;line-height:1.6">' +
      "<b>Configuração incorreta</b><br>" + aviso + "</div>";
  });
  throw new Error(aviso);
}
if (firebaseConfig.apiKey === "COLE_AQUI") {
  throw new Error("js/firebase.js: preencha o firebaseConfig com os dados do projeto omnia-oticas.");
}

export const PROJECT_ID = firebaseConfig.projectId;
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// E-mail elevado a super admin automaticamente
export const SUPER_ADMIN_EMAIL = "davi.vieira.each@gmail.com";
