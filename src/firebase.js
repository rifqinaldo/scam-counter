import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set } from 'firebase/database';

// Firebase Realtime Database configuration for real-time live count across all users
const firebaseConfig = {
  apiKey: "AIzaSyB_SCAM_COUNTER_PUBLIC_KEY",
  authDomain: "scam-counter-rifqinaldo.firebaseapp.com",
  databaseURL: "https://scam-counter-rifqinaldo-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scam-counter-rifqinaldo",
  storageBucket: "scam-counter-rifqinaldo.appspot.com",
  messagingSenderId: "109588503",
  appId: "1:109588503:web:scamcounterkey"
};

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase initialized with fallback mode", e);
}

export { db, ref, onValue, set };
