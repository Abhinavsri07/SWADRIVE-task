/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Admin Dashboard & Realtime Management Controller
 * ==============================================================================
 */

import { 
  db, 
  collection, 
  getDocs, 
  doc, 
  onSnapshot,
  query,
  where,
  getTodayString, 
  showToast 
} from "./firebase-config.js";
import { getAllMembers, getDailyAttendance, adminSetAttendance } from "./attendance.js";
import { getAllTasks, createTask } from "./tasks.js";
import { currentUserProfile } from "./auth.js";

// Cached state for realtime updates
let cachedMembers = [];
let cachedAttendanceToday = [];
let cachedTasks = [];

// Initialize Admin Dashboard
export async function initAdminDashboard() {
  setupRealtimeAdminListeners();
  setupAdminModals();
}

// Setup real-time Firestore listeners for instant reactivity
export function setupRealtimeAdminListeners() {
  const todayStr = getTodayString();

  // 1. Listen to Users (Interns)
  const usersQuery = query(collection(db, "users"), where("role", "==", "member"));
  onSnapshot(usersQuery, (snapshot) => {
    cachedMembers = [];
    snapshot.forEach(d => {
      cachedMembers.push({ id: d.id, ...d.data() });
    });
    // Sort by createdAt or internId
    cachedMembers.sort((a, b) => {
      if (a.internId && b.internId) return a.internId.localeCompare(b.internId);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    updateAdminView();
  }, (err) => {
    console.warn("Realtime users listener error:", err);
  });

  // 2. Listen to Today's Attendance
  const attendanceQuery = query(collection(db, "attendance"), where("date", "==", todayStr));
  onSnapshot(attendanceQuery, (snapshot) => {
    cachedAttendanceToday = [];
    snapshot.forEach(d => {
      cachedAttendanceToday.push({ id: d.id, ...d.data() });
    });
    updateAdminView();
  }, (err) => {
    console.warn("Realtime attendance listener error:", err);
  });

  // 3. Listen to Tasks
  onSnapshot(collection(db, "tasks"), (snapshot) => {
    cachedTasks = [];
    snapshot.forEach(d => {
      cachedTasks.push({ id: d.id, ...d.data() });
    });
    cachedTasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    updateAdminView();
  }, (err) => {
    console.warn("Realtime tasks listener error:", err);
  });
}

// Update all sections of Admin Dashboard simultaneously
function updateAdminView() {
  renderMetrics();
  renderRegisteredInternsTable();
  renderTodayAttendanceList();
  renderPendingSubmissions();
}

// Render metric summary cards
function renderMetrics() {
  const members = cachedMembers;
  const attendanceToday = cachedAttendanceToday;
  const tasks = cachedTasks;

  const presentCount = attendanceToday.filter(a => a.status && (a.status.toLowerCase() === "present" || a.status === "p")).length;
  const absentCount = Math.max(0, members.length - presentCount);

  const pendingTasks = tasks.filter(t => t.status === "ASSIGNED" || t.status === "IN PROGRESS").length;
  const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
  const submittedTasks = tasks.filter(t => t.status === "SUBMITTED").length;

  const elTotalMembers = document.getElementById("statTotalMembers");
  const elPresentToday = document.getElementById("statPresentToday");
  const elAbsentToday = document.getElementById("statAbsentToday");
  const elTotalTasks = document.getElementById("statTotalTasks");
  const elPendingTasks = document.getElementById("statPendingTasks");
  const elCompletedTasks = document.getElementById("statCompletedTasks");
  const elSubmittedTasks = document.getElementById("statSubmittedTasks");

  if (elTotalMembers) elTotalMembers.textContent = members.length;
  if (elPresentToday) elPresentToday.textContent = presentCount;
  if (elAbsentToday) elAbsentToday.textContent = absentCount;
  if (elTotalTasks) elTotalTasks.textContent = tasks.length;
  if (elPendingTasks) elPendingTasks.textContent = pendingTasks;
  if (elCompletedTasks) elCompletedTasks.textContent = completedTasks;
  if (elSubmittedTasks) elSubmittedTasks.textContent = submittedTasks;
}

// Render Registered Interns Directory Table
function renderRegisteredInternsTable() {
  const tableBody = document.getElementById("registeredInternsTableBody");
  if (!tableBody) return;

  const members = cachedMembers;
  const todayStr = getTodayString();

  if (members.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--color-slate-400);">
          No registered interns found yet. When an intern registers (e.g. SWDI-006), their real data will appear here automatically via Firestore real-time listener.
        </td>
      </tr>
    `;
    return;
  }

  // Map attendance by userId
  const attendanceMap = {};
  cachedAttendanceToday.forEach(a => {
    attendanceMap[a.userId] = a;
  });

  tableBody.innerHTML = members.map(m => {
    const memberId = m.id || m.uid;
    const internId = m.internId || m.name || memberId;
    
    // Format registration date
    let regDate = "-";
    if (m.createdAt) {
      try {
        const d = new Date(m.createdAt);
        regDate = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      } catch (_) {
        regDate = m.createdAt.substring(0, 10);
      }
    }

    // Attendance status today
    const att = attendanceMap[memberId];
    const isPresent = att && att.status && (att.status.toLowerCase() === "present" || att.status === "p");
    const attBadge = isPresent
      ? `<span class="badge badge-present">Present (${att.checkIn || 'Logged'})</span>`
      : `<span class="badge badge-absent">Absent</span>`;

    // Tasks assigned to this intern
    const internTasks = cachedTasks.filter(t => 
      t.assignedTo === memberId || 
      (t.assignedToInternId && t.assignedToInternId.toUpperCase() === internId.toUpperCase())
    );

    const taskCountText = internTasks.length === 1 ? "1 Task" : `${internTasks.length} Tasks`;

    // Task status breakdown
    let statusBreakdownHtml = "";
    if (internTasks.length === 0) {
      statusBreakdownHtml = `<span style="color: var(--color-slate-400); font-size: 0.8rem;">None assigned</span>`;
    } else {
      const assignedCount = internTasks.filter(t => t.status === "ASSIGNED").length;
      const inProgCount = internTasks.filter(t => t.status === "IN PROGRESS").length;
      const subCount = internTasks.filter(t => t.status === "SUBMITTED").length;
      const compCount = internTasks.filter(t => t.status === "COMPLETED").length;
      const rejCount = internTasks.filter(t => t.status === "REJECTED").length;

      const pills = [];
      if (assignedCount > 0) pills.push(`<span class="badge badge-assigned">${assignedCount} Assigned</span>`);
      if (inProgCount > 0) pills.push(`<span class="badge badge-inprogress">${inProgCount} In Progress</span>`);
      if (subCount > 0) pills.push(`<span class="badge badge-submitted">${subCount} In Review</span>`);
      if (compCount > 0) pills.push(`<span class="badge badge-completed">${compCount} Done</span>`);
      if (rejCount > 0) pills.push(`<span class="badge badge-rejected">${rejCount} Revision</span>`);
      statusBreakdownHtml = `<div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">${pills.join("")}</div>`;
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-primary); font-size: 0.95rem;">${internId}</div>
          <div style="font-size: 0.75rem; color: var(--color-slate-400);">Role: ${m.role}</div>
        </td>
        <td>
          <span style="font-size: 0.85rem; color: var(--color-slate-600);">${regDate}</span>
        </td>
        <td>
          ${attBadge}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--color-slate-700);">${taskCountText}</div>
          ${internTasks.slice(0, 2).map(t => `<div style="font-size: 0.75rem; color: var(--color-slate-500); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">&bull; ${t.title}</div>`).join("")}
        </td>
        <td>
          ${statusBreakdownHtml}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-primary btn-sm quick-assign-task-btn" 
              data-id="${memberId}" 
              data-intern-id="${internId}"
              data-email="${m.email || ''}">
              Assign Task
            </button>
            <button class="btn btn-secondary btn-sm toggle-attendance-btn" 
              data-id="${memberId}" 
              data-name="${internId}" 
              data-email="${m.email || ''}"
              data-current="${isPresent ? 'Present' : 'Absent'}">
              Toggle
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Attach quick assign handlers
  tableBody.querySelectorAll(".quick-assign-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const uId = btn.dataset.id;
      const internId = btn.dataset.internId;
      openTaskModalWithPreselect(uId, internId);
    });
  });

  // Attach status toggle event
  tableBody.querySelectorAll(".toggle-attendance-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uId = btn.dataset.id;
      const uName = btn.dataset.name;
      const uEmail = btn.dataset.email;
      const current = btn.dataset.current;
      const newStatus = current === "Present" ? "Absent" : "Present";

      btn.disabled = true;
      await adminSetAttendance(uId, uName, uEmail, todayStr, newStatus);
    });
  });
}

// Render Today's Attendance Table
function renderTodayAttendanceList() {
  const tableBody = document.getElementById("todayAttendanceTableBody");
  if (!tableBody) return;

  const members = cachedMembers;
  const todayStr = getTodayString();

  if (members.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--color-slate-400);">No registered interns found.</td></tr>`;
    return;
  }

  const attendanceMap = {};
  cachedAttendanceToday.forEach(a => {
    attendanceMap[a.userId] = a;
  });

  tableBody.innerHTML = members.map(m => {
    const memberId = m.id || m.uid;
    const internId = m.internId || m.name || memberId;
    const record = attendanceMap[memberId];
    const isPresent = record && record.status && (record.status.toLowerCase() === "present" || record.status === "p");
    const statusBadge = isPresent
      ? `<span class="badge badge-present">Present</span>`
      : `<span class="badge badge-absent">Absent</span>`;
    const checkInTime = record && record.checkIn ? record.checkIn : "-";

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-slate-800);">${internId}</div>
          <div style="font-size: 0.75rem; color: var(--color-slate-400);">${m.role}</div>
        </td>
        <td>${m.department || "Engineering"}</td>
        <td>${todayStr}</td>
        <td>${statusBadge}</td>
        <td>${checkInTime}</td>
        <td>
          <button class="btn btn-secondary btn-sm toggle-attendance-btn" 
            data-id="${memberId}" 
            data-name="${internId}" 
            data-email="${m.email || ''}"
            data-current="${isPresent ? 'Present' : 'Absent'}">
            Toggle Status
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tableBody.querySelectorAll(".toggle-attendance-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uId = btn.dataset.id;
      const uName = btn.dataset.name;
      const uEmail = btn.dataset.email;
      const current = btn.dataset.current;
      const newStatus = current === "Present" ? "Absent" : "Present";

      btn.disabled = true;
      await adminSetAttendance(uId, uName, uEmail, todayStr, newStatus);
    });
  });
}

// Render Submissions Awaiting Review
function renderPendingSubmissions() {
  const listContainer = document.getElementById("pendingSubmissionsList");
  if (!listContainer) return;

  const submittedTasks = cachedTasks.filter(t => t.status === "SUBMITTED");

  if (submittedTasks.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--color-slate-400);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.6;"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <p>No submissions awaiting review right now.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Task Title</th>
            <th>Assigned Intern</th>
            <th>Priority</th>
            <th>Deadline</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${submittedTasks.map(t => `
            <tr>
              <td>
                <div style="font-weight: 600; color: var(--color-slate-800);">${t.title}</div>
                <div style="font-size: 0.75rem; color: var(--color-slate-500); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description}</div>
              </td>
              <td>
                <span class="badge badge-assigned" style="font-weight: 600;">${t.assignedToInternId || t.assignedToName || "Intern"}</span>
              </td>
              <td><span class="priority-${(t.priority || 'medium').toLowerCase()}">${t.priority || 'Medium'}</span></td>
              <td>${t.deadline || "-"}</td>
              <td>
                <a href="task-details.html?id=${t.id}" class="btn btn-primary btn-sm">
                  Review &amp; Approve
                </a>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Helper to open task modal with intern preselected
function openTaskModalWithPreselect(memberId, internId) {
  const taskModal = document.getElementById("createTaskModal");
  const memberSelect = document.getElementById("taskAssignedTo");
  if (!taskModal || !memberSelect) return;

  populateMembersDropdown(memberId);
  taskModal.classList.add("show");
}

// Populate members select dropdown
function populateMembersDropdown(selectedId = "") {
  const memberSelect = document.getElementById("taskAssignedTo");
  if (!memberSelect) return;

  if (cachedMembers.length === 0) {
    memberSelect.innerHTML = `<option value="">No interns registered yet</option>`;
    return;
  }

  memberSelect.innerHTML = cachedMembers.map(m => {
    const mId = m.id || m.uid;
    const internId = m.internId || m.name || mId;
    const isSel = mId === selectedId ? "selected" : "";
    return `
      <option value="${mId}" data-intern-id="${internId}" data-email="${m.email || ''}" ${isSel}>
        ${internId} (${m.role})
      </option>
    `;
  }).join("");
}

// Setup Admin Modals
function setupAdminModals() {
  const openTaskBtn = document.getElementById("openCreateTaskModalBtn");
  const taskModal = document.getElementById("createTaskModal");
  const closeTaskBtns = document.querySelectorAll("[data-close-modal='createTaskModal']");
  const taskForm = document.getElementById("createTaskForm");

  if (openTaskBtn && taskModal) {
    openTaskBtn.addEventListener("click", () => {
      populateMembersDropdown();
      taskModal.classList.add("show");
    });
  }

  closeTaskBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (taskModal) taskModal.classList.remove("show");
    });
  });

  if (taskForm) {
    taskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("taskTitle").value;
      const description = document.getElementById("taskDescription").value;
      const assignedToSelect = document.getElementById("taskAssignedTo");
      const assignedTo = assignedToSelect.value;
      const selectedOption = assignedToSelect.options[assignedToSelect.selectedIndex];
      const assignedToInternId = selectedOption ? selectedOption.dataset.internId : "";
      const assignedToEmail = selectedOption ? selectedOption.dataset.email : "";
      const priority = document.getElementById("taskPriority").value;
      const deadline = document.getElementById("taskDeadline").value;

      if (!title || !assignedTo || !deadline) {
        showToast("Please complete all required fields.", "warning");
        return;
      }

      const submitBtn = taskForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";

      const res = await createTask({
        title,
        description,
        assignedTo,
        assignedToInternId,
        assignedToName: assignedToInternId || "Intern",
        assignedToEmail,
        priority,
        deadline
      }, currentUserProfile);

      submitBtn.disabled = false;
      submitBtn.textContent = "Create & Assign Task";

      if (res.success) {
        taskForm.reset();
        taskModal.classList.remove("show");
      }
    });
  }
}
