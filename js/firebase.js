// ============================================================
// OMNIA Ótica — inicialização do Firebase
//
// Projeto EXCLUSIVO da ótica: omnia-oticas
// Não aponte para omnia-3b32b — aquele é o banco da rede de roupas (TXC).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAiOhLlNkwi2Axv7hXn2_7GX4u_Uc01BzQ",
  authDomain: "omnia-oticas.firebaseapp.com",
  projectId: "omnia-oticas",
  storageBucket: "omnia-oticas.firebasestorage.app",
  messagingSenderId: "917109755609",
  appId: "1:917109755609:web:39c3d5a0bf1116f01738c8"
};

// Trava: impede o sistema de voltar a gravar no banco das roupas por engano.
if (firebaseConfig.projectId === "omnia-3b32b") {
  const aviso = "O OMNIA Ótica está apontando para o projeto da rede de roupas. " +
                "Corrija o firebaseConfig em js/firebase.js para omnia-oticas.";
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = '<div style="font-family:system-ui;max-width:540px;margin:12vh auto;padding:24px;' +
      'border:2px solid #d33;border-radius:14px;color:#d33;line-height:1.6"><b>Configuração incorreta</b><br>' +
      aviso + "</div>";
  });
  throw new Error(aviso);
}

export const PROJECT_ID = firebaseConfig.projectId;
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// E-mail elevado a super admin automaticamente
export const SUPER_ADMIN_EMAIL = "davi.vieira.each@gmail.com";
