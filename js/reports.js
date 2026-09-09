/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Reports & Analytics Generation Module
 * ==============================================================================
 */

import { 
  db, 
  collection, 
  getDocs, 
  query, 
  where, 
  showToast 
} from "./firebase-config.js";

// Generate Member-wise Attendance Summary
export async function getAttendanceReportData(startDateStr, endDateStr) {
  try {
    // 1. Fetch all members
    const usersSnap = await getDocs(collection(db, "users"));
    const members = [];
    usersSnap.forEach((doc) => {
      const u = doc.data();
      if (u.role === "member") {
        members.push({ id: doc.id, ...u });
      }
    });

    // 2. Fetch all attendance
    const attendanceSnap = await getDocs(collection(db, "attendance"));
    const records = [];
    attendanceSnap.forEach((doc) => {
      const d = doc.data();
      if (!startDateStr || !endDateStr || (d.date >= startDateStr && d.date <= endDateStr)) {
        records.push(d);
      }
    });

    // 3. Aggregate per member
    const summary = members.map(m => {
      const userRecords = records.filter(r => r.userId === m.id);
      const presentCount = userRecords.filter(r => r.status === "Present").length;
      const absentCount = userRecords.filter(r => r.status === "Absent").length;
      const totalDays = presentCount + absentCount;
      const rate = totalDays > 0 ? Math.round((presentCount / totalDays) * 1000) / 10 : 0;

      return {
        memberId: m.id,
        name: m.name || m.email,
        email: m.email,
        department: m.department || "General",
        presentCount,
        absentCount,
        totalDays,
        rate
      };
    });

    summary.sort((a, b) => b.rate - a.rate);

    return {
      membersCount: members.length,
      totalRecords: records.length,
      summary
    };
  } catch (error) {
    console.error("Error generating attendance report:", error);
    return { membersCount: 0, totalRecords: 0, summary: [] };
  }
}

// Generate Task Distribution Report Data
export async function getTaskReportData() {
  try {
    const tasksSnap = await getDocs(collection(db, "tasks"));
    const tasks = [];
    tasksSnap.forEach((doc) => tasks.push({ id: doc.id, ...doc.data() }));

    const total = tasks.length;
    const assigned = tasks.filter(t => t.status === "ASSIGNED").length;
    const inProgress = tasks.filter(t => t.status === "IN PROGRESS").length;
    const submitted = tasks.filter(t => t.status === "SUBMITTED").length;
    const completed = tasks.filter(t => t.status === "COMPLETED").length;
    const rejected = tasks.filter(t => t.status === "REJECTED").length;

    const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    return {
      total,
      assigned,
      inProgress,
      submitted,
      completed,
      rejected,
      completionRate,
      tasks
    };
  } catch (error) {
    console.error("Error generating task report:", error);
    return {
      total: 0,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      rejected: 0,
      completionRate: 0,
      tasks: []
    };
  }
}

// Export Attendance Summary to CSV
export function exportAttendanceReportCSV(summaryData, dateRangeLabel = "All_Time") {
  if (!summaryData || summaryData.length === 0) {
    showToast("No attendance data to export.", "warning");
    return;
  }

  const headers = ["Member Name", "Email", "Department", "Present Days", "Absent Days", "Total Tracked Days", "Attendance Rate %"];
  const rows = [headers.join(",")];

  summaryData.forEach(row => {
    rows.push([
      `"${row.name}"`,
      `"${row.email}"`,
      `"${row.department}"`,
      row.presentCount,
      row.absentCount,
      row.totalDays,
      `"${row.rate}%"`
    ].join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", `Attendance_Report_${dateRangeLabel}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Attendance Report downloaded!", "success");
}

// Export Tasks to CSV
export function exportTaskReportCSV(tasks) {
  if (!tasks || tasks.length === 0) {
    showToast("No tasks data to export.", "warning");
    return;
  }

  const headers = ["Task Title", "Assigned Member", "Priority", "Deadline", "Status", "Created Date"];
  const rows = [headers.join(",")];

  tasks.forEach(t => {
    rows.push([
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.assignedToName || t.assignedToEmail || '-'}"`,
      `"${t.priority || 'Medium'}"`,
      `"${t.deadline || '-'}"`,
      `"${t.status || 'ASSIGNED'}"`,
      `"${t.createdAt ? t.createdAt.split('T')[0] : '-'}"`
    ].join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", `Tasks_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Tasks Report downloaded!", "success");
}
