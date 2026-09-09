/**
 * ==============================================================================
 * ATTENDANCE & TASK DISTRIBUTION MANAGEMENT SYSTEM
 * Task Management & Submission Workflow Module
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
  addDoc, 
  updateDoc, 
  deleteDoc, 
  uploadTaskFile,
  showToast 
} from "./firebase-config.js";

// Task Status Constants
export const TASK_STATUS = {
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN PROGRESS",
  SUBMITTED: "SUBMITTED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED"
};

// Create a new task (Admin)
export async function createTask(taskData, adminProfile) {
  try {
    const taskPayload = {
      title: taskData.title.trim(),
      description: taskData.description.trim(),
      assignedTo: taskData.assignedTo,
      assignedToInternId: taskData.assignedToInternId || taskData.assignedToName || "",
      assignedToName: taskData.assignedToName || "Intern",
      assignedToEmail: taskData.assignedToEmail || "",
      assignedBy: adminProfile.uid,
      assignedByName: adminProfile.name || adminProfile.email,
      priority: taskData.priority || "Medium",
      deadline: taskData.deadline,
      status: TASK_STATUS.ASSIGNED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "tasks"), taskPayload);

    // Create notification for assigned member
    await createNotification(
      taskData.assignedTo,
      "task_assigned",
      "New Task Assigned",
      `You have been assigned: "${taskData.title}". Deadline: ${taskData.deadline}`,
      `task-details.html?id=${docRef.id}`
    );

    showToast("Task successfully created and assigned!", "success");
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error creating task:", error);
    showToast("Failed to create task.", "error");
    return { success: false, error: error.message };
  }
}

// Update an existing task (Admin)
export async function updateTask(taskId, updateData) {
  try {
    const taskRef = doc(db, "tasks", taskId);
    updateData.updatedAt = new Date().toISOString();
    await updateDoc(taskRef, updateData);
    showToast("Task updated successfully!", "success");
    return { success: true };
  } catch (error) {
    console.error("Error updating task:", error);
    showToast("Failed to update task.", "error");
    return { success: false };
  }
}

// Delete a task (Admin)
export async function deleteTask(taskId) {
  try {
    await deleteDoc(doc(db, "tasks", taskId));
    showToast("Task deleted successfully.", "info");
    return { success: true };
  } catch (error) {
    console.error("Error deleting task:", error);
    showToast("Failed to delete task.", "error");
    return { success: false };
  }
}

// Get task by ID
export async function getTaskById(taskId) {
  try {
    const taskDoc = await getDoc(doc(db, "tasks", taskId));
    if (taskDoc.exists()) {
      return { id: taskDoc.id, ...taskDoc.data() };
    }
    return null;
  } catch (error) {
    console.error("Error getting task:", error);
    return null;
  }
}

// Get all tasks (for Admin)
export async function getAllTasks() {
  try {
    const snapshot = await getDocs(collection(db, "tasks"));
    const tasks = [];
    snapshot.forEach((doc) => tasks.push({ id: doc.id, ...doc.data() }));
    tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return tasks;
  } catch (error) {
    console.error("Error getting all tasks:", error);
    return [];
  }
}

// Get tasks assigned to a specific member
export async function getMemberTasks(memberId, internId = "") {
  try {
    const tasksMap = new Map();
    const q1 = query(collection(db, "tasks"), where("assignedTo", "==", memberId));
    const snapshot1 = await getDocs(q1);
    snapshot1.forEach((doc) => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));

    if (internId) {
      const q2 = query(collection(db, "tasks"), where("assignedToInternId", "==", internId));
      const snapshot2 = await getDocs(q2);
      snapshot2.forEach((doc) => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
    }

    const tasks = Array.from(tasksMap.values());
    tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return tasks;
  } catch (error) {
    console.error("Error getting member tasks:", error);
    return [];
  }
}

// Member starts task (Transitions ASSIGNED -> IN PROGRESS, or REJECTED -> IN PROGRESS)
export async function startTask(taskId, currentStatus) {
  try {
    if (currentStatus !== TASK_STATUS.ASSIGNED && currentStatus !== TASK_STATUS.REJECTED) {
      showToast("Cannot start task from this status.", "warning");
      return { success: false };
    }

    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, {
      status: TASK_STATUS.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    showToast("Task status updated to IN PROGRESS!", "success");
    return { success: true };
  } catch (error) {
    console.error("Error starting task:", error);
    showToast("Failed to update status.", "error");
    return { success: false };
  }
}

// Submit completed task (Member)
export async function submitTaskWork(taskId, taskTitle, userProfile, { description, githubUrl, file }, onProgress) {
  try {
    showToast("Uploading attachment & submitting...", "info");

    let fileUrl = "";
    let fileName = "";

    if (file) {
      const uploadRes = await uploadTaskFile(file, userProfile.uid, onProgress);
      fileUrl = uploadRes.url;
      fileName = uploadRes.name;
    }

    const submissionData = {
      taskId: taskId,
      taskTitle: taskTitle,
      userId: userProfile.uid,
      userName: userProfile.name || userProfile.email,
      userEmail: userProfile.email,
      description: description.trim(),
      githubUrl: githubUrl ? githubUrl.trim() : "",
      fileUrl: fileUrl,
      fileName: fileName,
      submittedAt: new Date().toISOString(),
      reviewStatus: "PENDING",
      reviewComments: ""
    };

    // Save submission record
    const subRef = await addDoc(collection(db, "submissions"), submissionData);

    // Update task status to SUBMITTED
    await updateDoc(doc(db, "tasks", taskId), {
      status: TASK_STATUS.SUBMITTED,
      latestSubmissionId: subRef.id,
      updatedAt: new Date().toISOString()
    });

    // Notify admins
    const usersSnap = await getDocs(collection(db, "users"));
    usersSnap.forEach(async (uDoc) => {
      const u = uDoc.data();
      if (u.role === "admin") {
        await createNotification(
          uDoc.id,
          "task_submitted",
          "New Task Submission",
          `${userProfile.name || userProfile.email} submitted "${taskTitle}".`,
          `task-details.html?id=${taskId}`
        );
      }
    });

    showToast("Task submitted successfully! Awaiting Admin review.", "success");
    return { success: true, submissionId: subRef.id };
  } catch (error) {
    console.error("Error submitting task:", error);
    showToast("Failed to submit task. Please try again.", "error");
    return { success: false, error: error.message };
  }
}

// Get submissions for a task
export async function getTaskSubmissions(taskId) {
  try {
    const q = query(collection(db, "submissions"), where("taskId", "==", taskId));
    const snapshot = await getDocs(q);
    const submissions = [];
    snapshot.forEach((doc) => submissions.push({ id: doc.id, ...doc.data() }));
    submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return submissions;
  } catch (error) {
    console.error("Error getting submissions:", error);
    return [];
  }
}

// Admin approves submission
export async function approveSubmission(submissionId, taskId, memberId, adminProfile, reviewComments = "") {
  try {
    // 1. Update submission
    await updateDoc(doc(db, "submissions", submissionId), {
      reviewStatus: "APPROVED",
      reviewComments: reviewComments.trim() || "Approved. Great work!",
      reviewedBy: adminProfile.name || adminProfile.email,
      reviewedAt: new Date().toISOString()
    });

    // 2. Update task to COMPLETED
    await updateDoc(doc(db, "tasks", taskId), {
      status: TASK_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 3. Notify member
    await createNotification(
      memberId,
      "task_approved",
      "Task Approved!",
      `Your submission for task has been approved!`,
      `task-details.html?id=${taskId}`
    );

    showToast("Task submission approved! Marked as COMPLETED.", "success");
    return { success: true };
  } catch (error) {
    console.error("Error approving submission:", error);
    showToast("Failed to approve submission.", "error");
    return { success: false };
  }
}

// Admin rejects submission
export async function rejectSubmission(submissionId, taskId, memberId, adminProfile, reviewComments) {
  if (!reviewComments || !reviewComments.trim()) {
    showToast("Please provide rejection feedback so the member can make corrections.", "warning");
    return { success: false };
  }

  try {
    // 1. Update submission
    await updateDoc(doc(db, "submissions", submissionId), {
      reviewStatus: "REJECTED",
      reviewComments: reviewComments.trim(),
      reviewedBy: adminProfile.name || adminProfile.email,
      reviewedAt: new Date().toISOString()
    });

    // 2. Update task to REJECTED
    await updateDoc(doc(db, "tasks", taskId), {
      status: TASK_STATUS.REJECTED,
      rejectionFeedback: reviewComments.trim(),
      updatedAt: new Date().toISOString()
    });

    // 3. Notify member
    await createNotification(
      memberId,
      "task_rejected",
      "Submission Needs Revisions",
      `Your submission was rejected: "${reviewComments.trim()}". Please resume work and resubmit.`,
      `task-details.html?id=${taskId}`
    );

    showToast("Submission rejected with feedback.", "info");
    return { success: true };
  } catch (error) {
    console.error("Error rejecting submission:", error);
    showToast("Failed to reject submission.", "error");
    return { success: false };
  }
}

// Create notification
export async function createNotification(userId, type, title, message, link = "") {
  try {
    await addDoc(collection(db, "notifications"), {
      userId,
      type,
      title,
      message,
      link,
      read: false,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Error creating notification:", err);
  }
}
