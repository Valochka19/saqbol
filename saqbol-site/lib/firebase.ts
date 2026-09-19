import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Веб-ключ Firebase публичный по своей природе: доступ ограничивают правила Firestore,
// а они открывают сайту только готовую сводку и очередь веб-проверок.
const config = {
  projectId: "saqbol-ai-kz",
  appId: "1:83482660597:web:2901e7290b631448757fbc",
  apiKey: "AIzaSyAOehRD2kakGKTeb12Jk9mUxlOYmN4t5nI",
  authDomain: "saqbol-ai-kz.firebaseapp.com",
  storageBucket: "saqbol-ai-kz.firebasestorage.app",
  messagingSenderId: "83482660597",
};

const app = getApps().length ? getApp() : initializeApp(config);
export const db = getFirestore(app);
