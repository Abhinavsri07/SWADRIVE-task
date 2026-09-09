/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Attendance Management Module (Daily & Weekly Matrix)
 * ==============================================================================
 */

import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  getTodayString,
  showToast 
} from "./firebase-config.js";

// Helper: Format time as e.g. "09:30 AM"
export function getCurrentTimeString() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Helper: Format YYYY-MM-DD
export function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper: Calculate Monday of a given date's week
export function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  // day: 0=Sun, 1=Mon, ..., 6=Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get the 7 days of the week (Mon to Sun)
export function getWorkDaysOfWeek(mondayDate) {
  const days = [];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    days.push({
      name: dayNames[i],
      dateStr: formatDateISO(d),
      displayDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shortDate: `${d.getDate()}/${d.getMonth() + 1}`,
      fullDate: d
    });
  }
  return days;
}

// Check if user has already marked attendance today
export async function checkUserTodayAttendance(userId, dateStr = getTodayString()) {
  try {
    const docId = `${userId}_${dateStr}`;
    const attendanceDoc = await getDoc(doc(db, "attendance", docId));
    if (attendanceDoc.exists()) {
      return { marked: true, data: attendanceDoc.data() };
    }
    return { marked: false, data: null };
  } catch (error) {
    console.error("Error checking today attendance:", error);
    return { marked: false, data: null };
  }
}

// Mark daily attendance for member
export async function markDailyAttendance(userProfile, status = "present", notes = "") {
  if (!userProfile || !userProfile.uid) {
    showToast("User session not found.", "error");
    return { success: false, error: "No user session" };
  }

  const todayStr = getTodayString();
  const docId = `${userProfile.uid}_${todayStr}`;
  const internId = userProfile.internId || userProfile.name || "INTERN";

  try {
    // 4. Check whether this intern has already marked attendance for today
    const existing = await getDoc(doc(db, "attendance", docId));
    if (existing.exists()) {
      // 5. If already marked, show exact message
      showToast("Attendance already marked for today.", "warning");
      return { success: false, alreadyMarked: true, data: existing.data() };
    }

    // 6. If not marked, create attendance record in Firestore
    const checkInTime = getCurrentTimeString();
    const record = {
      userId: userProfile.uid,
      internId: internId,
      date: todayStr,
      status: "present",
      checkIn: checkInTime,
      createdAt: new Date().toISOString()
    };

    if (notes) {
      record.notes = notes;
    }
    if (userProfile.department) {
      record.department = userProfile.department;
    }

    await setDoc(doc(db, "attendance", docId), record);
    showToast("Attendance marked successfully!", "success");
    return { success: true, data: record };
  } catch (error) {
    console.error("Error marking attendance:", error);
    showToast(`Failed to mark attendance: ${error.message || "Please try again."}`, "error");
    return { success: false, error: error.message };
  }
}

// Admin manual mark or update attendance for any member
export async function adminSetAttendance(userId, userName, userEmail, dateStr, status, checkInTime = "09:00 AM") {
  const docId = `${userId}_${dateStr}`;
  try {
    const record = {
      userId,
      userName,
      userEmail,
      date: dateStr,
      status, // "Present" or "Absent"
      checkIn: status === "Present" ? checkInTime : "-",
      createdAt: new Date().toISOString(),
      updatedByAdmin: true
    };
    await setDoc(doc(db, "attendance", docId), record, { merge: true });
    showToast(`Attendance for ${userName} on ${dateStr} set to ${status}.`, "success");
    return { success: true };
  } catch (error) {
    console.error("Admin set attendance error:", error);
    showToast("Failed to update attendance.", "error");
    return { success: false };
  }
}

// Get daily attendance records for a specific date
export async function getDailyAttendance(dateStr = getTodayString()) {
  try {
    const q = query(collection(db, "attendance"), where("date", "==", dateStr));
    const querySnapshot = await getDocs(q);
    const records = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });
    return records;
  } catch (error) {
    console.error("Error fetching daily attendance:", error);
    return [];
  }
}

// Fetch all members list
export async function getAllMembers() {
  try {
    const q = query(collection(db, "users"));
    const snapshot = await getDocs(q);
    const members = [];
    snapshot.forEach((doc) => {
      const u = doc.data();
      // include if role is member or all users
      if (u.role === "member") {
        members.push({ id: doc.id, ...u });
      }
    });
    return members;
  } catch (error) {
    console.error("Error fetching members:", error);
    return [];
  }
}

// Fetch Weekly Attendance Matrix Data
export async function getWeeklyAttendanceMatrix(mondayDate) {
  const workDays = getWorkDaysOfWeek(mondayDate);
  const startDateStr = workDays[0].dateStr;
  const endDateStr = workDays[6].dateStr;

  // 1. Fetch all members
  const members = await getAllMembers();

  // 2. Fetch all attendance records in this date range
  let attendanceRecords = [];
  try {
    const q = query(
      collection(db, "attendance"),
      where("date", ">=", startDateStr),
      where("date", "<=", endDateStr)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => attendanceRecords.push(doc.data()));
  } catch (err) {
    console.warn("Date range query fallback:", err);
    // Fallback if composite index is pending: fetch all attendance
    const allSnapshot = await getDocs(collection(db, "attendance"));
    allSnapshot.forEach(doc => {
      const d = doc.data();
      if (d.date >= startDateStr && d.date <= endDateStr) {
        attendanceRecords.push(d);
      }
    });
  }

  // 3. Map into matrix structure
  // Key: `${userId}_${dateStr}` -> status
  const attendanceMap = {};
  attendanceRecords.forEach(rec => {
    attendanceMap[`${rec.userId}_${rec.date}`] = rec.status;
  });

  const todayStr = getTodayString();

  const matrixRows = members.map(member => {
    let presentCount = 0;
    let absentCount = 0;
    const dayStatuses = {};

    workDays.forEach(day => {
      const key = `${member.id || member.uid}_${day.dateStr}`;
      const status = attendanceMap[key];

      const isPresent = status && (status.toLowerCase() === "present" || status === "P");
      const isAbsent = status && (status.toLowerCase() === "absent" || status === "A");

      if (isPresent) {
        dayStatuses[day.name] = "P";
        presentCount++;
      } else if (isAbsent) {
        dayStatuses[day.name] = "A";
        absentCount++;
      } else {
        // If date is today or past, default to Absent 'A' if untracked, or '-' if in future
        if (day.dateStr <= todayStr) {
          dayStatuses[day.name] = "A";
          absentCount++;
        } else {
          dayStatuses[day.name] = "-";
        }
      }
    });

    const totalTrackedDays = presentCount + absentCount;
    const percentage = totalTrackedDays > 0 
      ? Math.round((presentCount / totalTrackedDays) * 1000) / 10 
      : 0;

    return {
      memberId: member.id || member.uid,
      internId: member.internId || member.name || member.email,
      memberName: member.name || member.email,
      memberEmail: member.email,
      department: member.department || "General",
      dayStatuses,
      presentCount,
      absentCount,
      percentage
    };
  });

  return {
    workDays,
    startDateStr,
    endDateStr,
    rows: matrixRows
  };
}

// Export weekly matrix to CSV
export function exportWeeklyAttendanceCSV(matrixData, weekLabel) {
  if (!matrixData || !matrixData.rows || matrixData.rows.length === 0) {
    showToast("No data available to export.", "warning");
    return;
  }

  const headers = [
    "Intern ID",
    "Department",
    ...matrixData.workDays.map(d => `${d.name} (${d.shortDate})`),
    "Present Days",
    "Absent Days",
    "Attendance %"
  ];

  const csvRows = [headers.join(",")];

  matrixData.rows.forEach(row => {
    const rowValues = [
      `"${row.internId || row.memberName}"`,
      `"${row.department}"`,
      ...matrixData.workDays.map(d => row.dayStatuses[d.name] || "-"),
      row.presentCount,
      row.absentCount,
      `"${row.percentage}%"`
    ];
    csvRows.push(rowValues.join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", `Weekly_Attendance_${weekLabel.replace(/[^a-zA-Z0-9]/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Weekly Attendance report exported to CSV!", "success");
}
