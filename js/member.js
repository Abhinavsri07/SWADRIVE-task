/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Member Dashboard & Actions Controller
 * ==============================================================================
 */

import { 
  db, 
  collection, 
  getDocs, 
  query, 
  where, 
  getTodayString, 
  showToast 
} from "./firebase-config.js";
import { 
  checkUserTodayAttendance, 
  markDailyAttendance 
} from "./attendance.js";
import { 
  getMemberTasks, 
  startTask, 
  TASK_STATUS 
} from "./tasks.js";
import { currentUserProfile } from "./auth.js";

// Initialize Member Dashboard
export async function initMemberDashboard(userProfile) {
  if (!userProfile) return;
  await loadAttendanceStatus(userProfile);
  await loadMemberTasksOverview(userProfile);
  await loadRecentAttendanceHistory(userProfile);
  setupAttendanceAction(userProfile);
}

// Check and display today's attendance status
export async function loadAttendanceStatus(userProfile) {
  const statusContainer = document.getElementById("todayAttendanceBox");
  const attendanceBtn = document.getElementById("markPresentBtn");
  const todayDateDisplay = document.getElementById("todayDateText");

  const todayStr = getTodayString();
  if (todayDateDisplay) {
    const d = new Date();
    todayDateDisplay.textContent = d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  const { marked, data } = await checkUserTodayAttendance(userProfile.uid, todayStr);

  if (statusContainer) {
    const isPresent = marked && data && data.status && (data.status.toLowerCase() === "present" || data.status === "p");
    if (isPresent) {
      statusContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: var(--color-present-bg); color: var(--color-present); display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <div style="font-weight: 700; color: var(--color-present); font-size: 1.1rem;">You are marked Present Today!</div>
            <div style="font-size: 0.85rem; color: var(--color-slate-500);">Checked in at <strong>${data.checkIn || 'Logged'}</strong> (${todayStr})</div>
          </div>
        </div>
      `;
      if (attendanceBtn) {
        attendanceBtn.style.display = "none";
      }
    } else {
      statusContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: var(--color-warning-bg); color: var(--color-warning); display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style="font-weight: 700; color: var(--color-slate-800); font-size: 1.05rem;">Daily Attendance Not Marked</div>
            <div style="font-size: 0.85rem; color: var(--color-slate-500);">Please mark your attendance for ${todayStr} to confirm your check-in.</div>
          </div>
        </div>
      `;
      if (attendanceBtn) {
        attendanceBtn.style.display = "inline-flex";
        attendanceBtn.disabled = false;
        attendanceBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Mark Attendance</span>
        `;
      }
    }
  }
}

// Setup 1-click attendance button
function setupAttendanceAction(userProfile) {
  const attendanceBtn = document.getElementById("markPresentBtn");
  if (!attendanceBtn) return;

  // Prevent multiple listeners
  if (attendanceBtn.dataset.bound) return;
  attendanceBtn.dataset.bound = "true";

  attendanceBtn.addEventListener("click", async () => {
    attendanceBtn.disabled = true;
    attendanceBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>Marking Attendance...</span>
    `;

    const res = await markDailyAttendance(userProfile, "present");

    if (res.success || res.alreadyMarked) {
      await loadAttendanceStatus(userProfile);
      await loadRecentAttendanceHistory(userProfile);
    } else {
      attendanceBtn.disabled = false;
      attendanceBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Mark Attendance</span>
      `;
    }
  });
}

// Load tasks for member dashboard
export async function loadMemberTasksOverview(userProfile) {
  const tasks = await getMemberTasks(userProfile.uid);

  const assignedCount = tasks.filter(t => t.status === TASK_STATUS.ASSIGNED).length;
  const inProgressCount = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
  const submittedCount = tasks.filter(t => t.status === TASK_STATUS.SUBMITTED).length;
  const completedCount = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;

  const elAssigned = document.getElementById("statMemberAssigned");
  const elInProgress = document.getElementById("statMemberInProgress");
  const elSubmitted = document.getElementById("statMemberSubmitted");
  const elCompleted = document.getElementById("statMemberCompleted");

  if (elAssigned) elAssigned.textContent = assignedCount;
  if (elInProgress) elInProgress.textContent = inProgressCount;
  if (elSubmitted) elSubmitted.textContent = submittedCount;
  if (elCompleted) elCompleted.textContent = completedCount;

  const tableBody = document.getElementById("memberTasksTableBody");
  if (!tableBody) return;

  if (tasks.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--color-slate-400);">No tasks assigned to you yet. Enjoy your day!</td></tr>`;
    return;
  }

  tableBody.innerHTML = tasks.map(t => {
    let statusClass = "badge-assigned";
    if (t.status === TASK_STATUS.IN_PROGRESS) statusClass = "badge-inprogress";
    else if (t.status === TASK_STATUS.SUBMITTED) statusClass = "badge-submitted";
    else if (t.status === TASK_STATUS.COMPLETED) statusClass = "badge-completed";
    else if (t.status === TASK_STATUS.REJECTED) statusClass = "badge-rejected";

    let actionBtn = `<a href="task-details.html?id=${t.id}" class="btn btn-secondary btn-sm">View Details</a>`;
    if (t.status === TASK_STATUS.ASSIGNED) {
      actionBtn = `
        <button class="btn btn-primary btn-sm start-task-btn" data-id="${t.id}">
          Start Task
        </button>
      `;
    } else if (t.status === TASK_STATUS.IN_PROGRESS || t.status === TASK_STATUS.REJECTED) {
      actionBtn = `
        <a href="task-details.html?id=${t.id}" class="btn btn-primary btn-sm">
          ${t.status === TASK_STATUS.REJECTED ? 'Resubmit Work' : 'Submit Work'}
        </a>
      `;
    }

    return `
      <tr>
        <td>
          <a href="task-details.html?id=${t.id}" style="font-weight: 600; color: var(--color-slate-800);">${t.title}</a>
          <div style="font-size: 0.75rem; color: var(--color-slate-500); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description}</div>
        </td>
        <td><span class="priority-${(t.priority || 'medium').toLowerCase()}">${t.priority || 'Medium'}</span></td>
        <td>${t.deadline || "-"}</td>
        <td><span class="badge ${statusClass}">${t.status}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join("");

  // Attach start task handlers
  tableBody.querySelectorAll(".start-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const taskId = btn.dataset.id;
      btn.disabled = true;
      const res = await startTask(taskId, TASK_STATUS.ASSIGNED);
      if (res.success) {
        await loadMemberTasksOverview(userProfile);
      } else {
        btn.disabled = false;
      }
    });
  });
}

// Load recent attendance history
export async function loadRecentAttendanceHistory(userProfile) {
  const tableBody = document.getElementById("memberAttendanceHistoryBody");
  if (!tableBody) return;

  try {
    const q = query(collection(db, "attendance"), where("userId", "==", userProfile.uid));
    const snapshot = await getDocs(q);
    const records = [];
    snapshot.forEach((doc) => records.push(doc.data()));

    records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (records.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--color-slate-400);">No attendance history recorded yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = records.slice(0, 10).map(r => `
      <tr>
        <td><strong>${r.date}</strong></td>
        <td><span class="badge ${(r.status && (r.status.toLowerCase() === 'present' || r.status === 'p')) ? 'badge-present' : 'badge-absent'}">${(r.status && r.status.toLowerCase() === 'present') ? 'Present' : (r.status || 'Present')}</span></td>
        <td>${r.checkIn || '-'}</td>
        <td style="color: var(--color-slate-500); font-size: 0.8rem;">${r.notes || '-'}</td>
      </tr>
    `).join("");
  } catch (error) {
    console.error("Error loading attendance history:", error);
  }
}
