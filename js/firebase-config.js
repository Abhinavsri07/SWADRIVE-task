/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Firebase Initialization & Configuration Module
 * ==============================================================================
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  onSnapshot
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from "firebase/storage";

// ============================================================================
// DEFAULT PROVISIONED FIREBASE CREDENTIALS
// ============================================================================
export const defaultFirebaseConfig = {
  apiKey: "AIzaSyCX7QENMKLHG9OjA32Z0sUWltzoF9amKYM",
  authDomain: "gen-lang-client-0699874375.firebaseapp.com",
  projectId: "gen-lang-client-0699874375",
  storageBucket: "gen-lang-client-0699874375.firebasestorage.app",
  messagingSenderId: "653878562484",
  appId: "1:653878562484:web:8c7c2412a0fd097b4d51e1",
  firestoreDatabaseId: "ai-studio-attendancetaskdi-cc904bf6-49c5-44d1-8060-83efad67c846"
};

// Retrieve active configuration (custom override from localStorage if set)
export function getActiveFirebaseConfig() {
  try {
    const custom = localStorage.getItem("custom_firebase_config");
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return { ...defaultFirebaseConfig, ...parsed, isCustom: true };
      }
    }
  } catch (err) {
    console.warn("Could not read custom_firebase_config from storage:", err);
  }
  return { ...defaultFirebaseConfig, isCustom: false };
}

export const firebaseConfig = getActiveFirebaseConfig();

// Initialize Firebase App
let app;
let auth;
let db;
let storage;
let isFirebaseInitialized = false;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    try {
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
      console.warn("Falling back to default database instance:", e);
      db = getFirestore(app);
    }
  } else {
    db = getFirestore(app);
  }

  storage = getStorage(app);
  isFirebaseInitialized = true;
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Save Custom Firebase Credentials to localStorage & reload
export function saveCustomFirebaseConfig(configObj) {
  try {
    if (!configObj.apiKey || !configObj.projectId) {
      showToast("API Key and Project ID are required.", "warning");
      return false;
    }
    const cleanConfig = {
      apiKey: configObj.apiKey.trim(),
      authDomain: (configObj.authDomain || `${configObj.projectId.trim()}.firebaseapp.com`).trim(),
      projectId: configObj.projectId.trim(),
      storageBucket: (configObj.storageBucket || `${configObj.projectId.trim()}.firebasestorage.app`).trim(),
      messagingSenderId: (configObj.messagingSenderId || "").trim(),
      appId: (configObj.appId || "").trim(),
      firestoreDatabaseId: (configObj.firestoreDatabaseId || "(default)").trim()
    };
    localStorage.setItem("custom_firebase_config", JSON.stringify(cleanConfig));
    showToast("Firebase credentials saved! Reconnecting...", "success");
    setTimeout(() => {
      window.location.reload();
    }, 800);
    return true;
  } catch (e) {
    console.error("Error saving custom Firebase config:", e);
    showToast("Failed to save configuration: " + e.message, "error");
    return false;
  }
}

// Reset to default provisioned Firebase Configuration
export function resetFirebaseConfig() {
  localStorage.removeItem("custom_firebase_config");
  showToast("Reset to default Firebase configuration. Reloading...", "info");
  setTimeout(() => {
    window.location.reload();
  }, 800);
}

// Toast notification helper
export function showToast(message, type = "info", duration = 5000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else if (type === "warning") {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-msg" style="flex: 1; word-break: break-word;">${message}</div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Format date helpers
export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatTime(timeStr) {
  if (!timeStr) return "-";
  return timeStr;
}

export function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Upload file to Firebase Storage with progress callback, with graceful data URL fallback
export async function uploadTaskFile(file, userId, onProgress) {
  if (!file) return { url: "", name: "" };

  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filePath = `submissions/${userId}/${fileName}`;

  try {
    if (storage) {
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress(progress);
          },
          (error) => {
            console.warn("Storage upload error, falling back to client attachment URL:", error);
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve({
                url: e.target.result,
                name: file.name
              });
            };
            reader.onerror = () => reject(error);
            reader.readAsDataURL(file);
          },
          async () => {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              url: downloadUrl,
              name: file.name
            });
          }
        );
      });
    }
  } catch (err) {
    console.warn("Storage init exception, using data URL fallback:", err);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        url: e.target.result,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  });
}

// Safe no-op helpers to prevent breaking any callers
export function initFirebaseConfigModal() {
  // Debug/configuration modal removed for clean production UI
}

export function openFirebaseConfigModal() {
  // Debug/configuration modal removed for clean production UI
}

export { 
  app, 
  auth, 
  db, 
  storage, 
  isFirebaseInitialized,
  // Auth exports
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  // Firestore exports
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot
};
