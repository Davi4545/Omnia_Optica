// ============================================================
// OMNIA Ótica — inicialização do Firebase (compartilhado)
// Reaproveita o projeto existente (omnia-3b32b) para não perder dados.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTjYwOpMpwhGbrsUFPOgO2V-GXAwfcubA",
  authDomain: "omnia-3b32b.firebaseapp.com",
  projectId: "omnia-3b32b",
  storageBucket: "omnia-3b32b.firebasestorage.app",
  messagingSenderId: "858764463578",
  appId: "1:858764463578:web:1fabf841013e2053bd44e3"
};

export const PROJECT_ID = firebaseConfig.projectId;
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// e-mail que é elevado a superadmin automaticamente
export const SUPER_ADMIN_EMAIL = "davi.vieira.each@gmail.com";
