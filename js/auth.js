/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Authentication & Role-Based Access Control Module
 * ==============================================================================
 */

import { 
  auth, 
  db, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  doc, 
  getDoc, 
  setDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  showToast,
  openFirebaseConfigModal
} from "./firebase-config.js";

// Cached user state
export let currentUser = null;
export let currentUserProfile = null;

// Helper: Deterministic internal email mapping for Intern ID
export function getInternalEmailForIntern(internId) {
  const clean = internId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${clean}@intern-attendance.com`;
}

// Initialize Auth Listener & Route Guard
export function initAuthGuard(allowedRoles = []) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
            console.warn("User account exists in Auth but has no profile document in Firestore.");
            if (allowedRoles.length > 0) {
              await signOut(auth);
              window.location.replace("login.html");
              resolve(null);
              return;
            }
          }

          currentUserProfile = userDoc.data();
          currentUserProfile.uid = user.uid;

          // CRITICAL: Block any non-admin from Admin Portal immediately
          if (allowedRoles.length > 0 && !allowedRoles.includes(currentUserProfile.role)) {
            console.warn(`Access blocked: user role '${currentUserProfile.role}' not permitted for required roles: [${allowedRoles.join(", ")}]`);
            showToast("Access Denied: You do not have permission to view this portal.", "error");
            
            if (currentUserProfile.role === "admin") {
              window.location.replace("admin.html");
            } else {
              window.location.replace("member.html");
            }
            return;
          }

          // Realtime listener: If role ever changes or is manipulated, re-verify instantly
          onSnapshot(userDocRef, (snapshot) => {
            if (!snapshot.exists()) {
              signOut(auth);
              window.location.replace("login.html");
              return;
            }
            const liveRole = snapshot.data().role;
            if (allowedRoles.length > 0 && !allowedRoles.includes(liveRole)) {
              console.warn("Live security guard: role unauthorized, redirecting.");
              if (liveRole === "admin") {
                window.location.replace("admin.html");
              } else {
                window.location.replace("member.html");
              }
            }
          });

          updateUIForUser(currentUserProfile);
          setupNotifications(user.uid);
          resolve(currentUserProfile);
        } catch (error) {
          console.error("Error checking authorization guard:", error);
          if (allowedRoles.length > 0) {
            window.location.replace("login.html");
          }
          resolve(null);
        }
      } else {
        currentUser = null;
        currentUserProfile = null;
        if (allowedRoles.length > 0) {
          window.location.replace(`login.html?redirect=${encodeURIComponent(window.location.pathname)}`);
        }
        resolve(null);
      }
    });
  });
}

// Update Topbar and Sidebar with user data
export function updateUIForUser(profile) {
  if (!profile) return;

  const displayName = profile.internId || profile.name || profile.email;

  // Update user name in header/sidebar
  const userNameElements = document.querySelectorAll(".user-name, [data-user-name]");
  userNameElements.forEach((el) => {
    el.textContent = displayName;
  });

  // Update user role badge
  const userRoleElements = document.querySelectorAll(".user-role-badge, [data-user-role]");
  userRoleElements.forEach((el) => {
    el.textContent = (profile.role || "MEMBER").toUpperCase();
    if (profile.role === "admin") {
      el.style.background = "rgba(220, 38, 38, 0.25)";
      el.style.color = "#fca5a5";
    }
  });

  // Update user initials avatar
  const userAvatarElements = document.querySelectorAll(".user-avatar, [data-user-avatar]");
  const initials = displayName
    .split(/[\s-_]+/)
    .map(p => p[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  userAvatarElements.forEach((el) => {
    el.textContent = initials || "ID";
  });

  // Setup mobile sidebar toggle
  const toggleBtn = document.querySelector(".sidebar-toggle-btn");
  const sidebar = document.querySelector(".app-sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (backdrop) backdrop.classList.toggle("show");
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
    });
  }

  // Setup logout buttons
  const logoutButtons = document.querySelectorAll("#logoutBtn, .btn-logout, [data-action='logout']");
  logoutButtons.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await handleLogout();
    });
  });
}

// Intern Registration
// Registration asks ONLY: Intern ID, Password, Confirm Password
// Automatically creates role: "member"
export async function registerIntern(internId, password) {
  try {
    const cleanInternId = internId.trim().toUpperCase();

    // Format validation: SWDI-001, SWDI-002, etc.
    const pattern = /^SWDI-\d{3,}$/i;
    if (!pattern.test(cleanInternId)) {
      showToast("Intern ID must follow format SWDI-001, SWDI-002, etc.", "error");
      return { success: false, error: "Invalid Intern ID format" };
    }

    // Map to deterministic internal Firebase Auth email
    const internalEmail = getInternalEmailForIntern(cleanInternId);

    // Create Firebase Auth user
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, internalEmail, password);
    } catch (authErr) {
      console.error("Firebase Auth registration error:", authErr);
      let message = authErr.message;
      if (authErr.code === "auth/email-already-in-use") {
        message = `Intern ID "${cleanInternId}" is already registered. Please go to Sign In and enter your password.`;
        showToast(message, "warning", 6000);
      } else if (authErr.code === "auth/weak-password") {
        message = "Password must be at least 6 characters.";
        showToast(message, "error");
      } else if (authErr.code === "auth/operation-not-allowed") {
        message = "Email/Password sign-in is disabled on this Firebase project. Open 'Firebase Connection & Keys' to configure credentials or enable it in Firebase Console.";
        showToast(message, "error", 7000);
        openFirebaseConfigModal();
      } else if (authErr.code === "auth/invalid-api-key" || authErr.code === "auth/api-key-not-valid") {
        message = "Invalid Firebase API Key. Please open 'Firebase Connection & Keys' to update your API Key.";
        showToast(message, "error", 7000);
        openFirebaseConfigModal();
      } else if (authErr.code === "auth/network-request-failed") {
        message = "Network error connecting to Firebase. Please check your internet connection.";
        showToast(message, "error");
      } else {
        showToast(authErr.message || "Registration failed. Please check details.", "error", 6000);
      }
      return { success: false, error: message };
    }

    const user = userCredential.user;

    // Create user profile in Firestore
    // Note: Never store passwords in Firestore or localStorage!
    const userProfile = {
      uid: user.uid,
      internId: cleanInternId,
      name: cleanInternId,
      email: internalEmail,
      role: "member", // AUTOMATICALLY "member"
      department: "Internship",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", user.uid), userProfile);
    } catch (fsErr) {
      console.error("Firestore user profile creation error:", fsErr);
      showToast(`User created in Auth, but profile setup failed: ${fsErr.message}`, "error", 6000);
      return { success: false, error: fsErr.message };
    }

    showToast(`Registration successful! Welcome, ${cleanInternId}.`, "success");

    setTimeout(() => {
      window.location.href = "member.html";
    }, 1000);

    return { success: true, user, profile: userProfile };
  } catch (error) {
    console.error("Unexpected registration error:", error);
    showToast(error.message || "Registration encountered an unexpected issue.", "error", 6000);
    return { success: false, error: error.message };
  }
}

// User Login (Supports Intern ID and Admin Email)
export async function handleLogin(identifier, password, portalMode = "intern") {
  try {
    let emailToUse = "";
    let cleanInternId = "";

    if (portalMode === "intern") {
      cleanInternId = identifier.trim().toUpperCase();
      const pattern = /^SWDI-\d{3,}$/i;
      if (!pattern.test(cleanInternId)) {
        showToast("Intern ID must follow format SWDI-001, SWDI-002, etc.", "error");
        return { success: false, error: "Invalid Intern ID format" };
      }
      emailToUse = getInternalEmailForIntern(cleanInternId);
    } else {
      // Admin login: Uses email
      emailToUse = identifier.trim().toLowerCase();
    }

    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
    } catch (authErr) {
      console.error("Firebase signIn error:", authErr);
      let message = authErr.message;
      if (authErr.code === "auth/user-not-found" || authErr.code === "auth/wrong-password" || authErr.code === "auth/invalid-credential") {
        message = portalMode === "intern" 
          ? `Invalid credentials for Intern ID "${cleanInternId}". If you haven't registered yet, please click 'Register your Intern ID'.`
          : "Invalid Admin email or password.";
      } else if (authErr.code === "auth/operation-not-allowed") {
        message = "Email/Password sign-in is disabled in your Firebase Project. Enable it in Firebase Console -> Authentication.";
        openFirebaseConfigModal();
      } else if (authErr.code === "auth/invalid-api-key" || authErr.code === "auth/api-key-not-valid") {
        message = "Invalid Firebase API Key. Please click 'Firebase Connection & Keys' to update.";
        openFirebaseConfigModal();
      } else if (authErr.code === "auth/too-many-requests") {
        message = "Too many failed attempts. Access temporarily restricted. Please try again later.";
      }
      showToast(message, "error", 6000);
      return { success: false, error: message };
    }

    const user = userCredential.user;

    // Fetch Firestore document to verify real role
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // If user profile is missing in Firestore, create basic member profile automatically
      const fallbackProfile = {
        uid: user.uid,
        internId: cleanInternId || user.email.split("@")[0].toUpperCase(),
        name: cleanInternId || user.email.split("@")[0].toUpperCase(),
        email: user.email,
        role: "member",
        department: "Internship",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(userDocRef, fallbackProfile);
      showToast("Login successful! Welcome to the intern portal.", "success");
      setTimeout(() => {
        window.location.href = "member.html";
      }, 800);
      return { success: true, user, role: "member" };
    }

    const profileData = userDoc.data();
    const role = profileData.role || "member";

    // Enforce Admin portal security check
    if (portalMode === "admin" && role !== "admin") {
      await signOut(auth);
      showToast("Access Denied: This account does not possess Administrator privileges.", "error");
      return { success: false, error: "Access Denied" };
    }

    showToast("Login successful! Redirecting...", "success");

    // Redirect
    setTimeout(() => {
      if (role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "member.html";
      }
    }, 800);

    return { success: true, user, role };
  } catch (error) {
    console.error("Login error:", error);
    showToast(error.message || "Invalid credentials. Please verify and try again.", "error", 6000);
    return { success: false, error: error.message };
  }
}

// User Logout
export async function handleLogout() {
  try {
    await signOut(auth);
    currentUser = null;
    currentUserProfile = null;
    showToast("Signed out successfully", "info");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 500);
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Error signing out", "error");
  }
}

// Password Reset
export async function handleResetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset link sent to your email!", "success");
    return { success: true };
  } catch (error) {
    console.error("Password reset error:", error);
    showToast("Failed to send password reset email. Check email address.", "error");
    return { success: false, error: error.message };
  }
}

// Notifications setup
export async function setupNotifications(userId) {
  const bellContainer = document.querySelector(".notif-bell-container");
  const bellBtn = document.querySelector("#notifBellBtn");
  const notifDropdown = document.querySelector("#notifDropdown");
  const notifBadge = document.querySelector("#notifBadge");
  const notifList = document.querySelector("#notifList");

  if (!bellBtn || !notifDropdown) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (bellContainer && !bellContainer.contains(e.target)) {
      notifDropdown.classList.remove("show");
    }
  });

  try {
    const notifQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId)
    );

    const snapshot = await getDocs(notifQuery);
    const notifications = [];
    snapshot.forEach(doc => {
      notifications.push({ id: doc.id, ...doc.data() });
    });

    notifications.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const unreadCount = notifications.filter(n => !n.read).length;
    if (notifBadge) {
      if (unreadCount > 0) {
        notifBadge.textContent = unreadCount;
        notifBadge.style.display = "flex";
      } else {
        notifBadge.style.display = "none";
      }
    }

    if (notifList) {
      if (notifications.length === 0) {
        notifList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--color-slate-400); font-size: 0.85rem;">No notifications yet</div>`;
      } else {
        notifList.innerHTML = notifications.slice(0, 10).map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notif-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            </div>
            <div class="notif-content">
              <div class="notif-title">${n.title || "Notification"}</div>
              <div style="color: var(--color-slate-600); line-height: 1.3;">${n.message || ""}</div>
              <div class="notif-time">${n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</div>
            </div>
          </div>
        `).join("");
      }
    }
  } catch (err) {
    console.warn("Could not load notifications:", err);
  }
}
