// 1. IMPORTAÇÕES SEMPRE NO TOPO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"; 

// 2. CONFIGURAÇÃO DAS CHAVES
const firebaseConfig = {
  apiKey: "AIzaSyBjLqqMcYiUaIZbEvCZA8gv9Zmh26zhLK4",
  authDomain: "barbearia-extensao-ads.firebaseapp.com",
  projectId: "barbearia-extensao-ads",
  storageBucket: "barbearia-extensao-ads.firebasestorage.app",
  messagingSenderId: "1010586133423",
  appId: "1:1010586133423:web:19e54bd5ab623db6bfc55a"
};

// 3. INICIALIZAÇÃO
const app = initializeApp(firebaseConfig);

// 4. EXPORTAÇÃO PARA O RESTO DO SISTEMA
export const db = getFirestore(app);
export const auth = getAuth(app);