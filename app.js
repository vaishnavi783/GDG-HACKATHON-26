// ==================== Firebase References ====================
const loginPage = document.getElementById("login-page");
const dashboard = document.getElementById("dashboard");
const userEmailElem = document.getElementById("user-email");
const userRoleElem = document.getElementById("user-role");

const attendanceStatus = document.getElementById("attendance-status");
const predictionStatus = document.getElementById("prediction-status");
const correctionStatus = document.getElementById("correction-status");
const auditLogsDiv = document.getElementById("audit-logs");

const totalClassesElem = document.getElementById("total-classes");
const presentCountElem = document.getElementById("present-count");
const attendancePercentageElem = document.getElementById("attendance-percentage");

const todaysClassesDiv = document.getElementById("todays-classes");

let currentUser = null;

// ==================== Login ====================
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    currentUser = user;

    // Check role in Firestore
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists || doc.data().role !== role) {
      alert("Role mismatch!");
      auth.signOut();
      return;
    }

    userEmailElem.textContent = doc.data().email;
    userRoleElem.textContent = doc.data().role;

    loginPage.style.display = "none";
    dashboard.style.display = "block";

    loadDashboard();
  } catch (error) {
    alert("Login failed: " + error.message);
  }
}

// ==================== Logout ====================
function logout() {
  auth.signOut();
  loginPage.style.display = "flex";
  dashboard.style.display = "none";
}

// ==================== Load Dashboard ====================
async function loadDashboard() {
  if (!currentUser) return;

  const userDoc = await db.collection("users").doc(currentUser.uid).get();
  const role = userDoc.data().role;

  if (role === "student") {
    loadStudentDashboard();
  } else if (role === "teacher") {
    loadTeacherDashboard();
  }
}

// ==================== Student Dashboard ====================
async function loadStudentDashboard() {
  await loadTodaysClasses();
  await loadAttendanceSummary();
  await loadAuditLogs();
}

// Scan QR & Mark Attendance
async function markAttendance() {
  const studentUid = currentUser.uid;

  // You can generate QR verification logic here
  const sessionId = "dummy-session"; // replace with real sessionId after QR scan
  const classId = "dummy-class"; // replace with classId of QR session
  const now = new Date();

  // Geo location (dummy example)
  const location = new firebase.firestore.GeoPoint(12.9716, 77.5946);

  await db
    .collection("attendance")
    .doc(classId)
    .collection(formatDate(now))
    .doc(studentUid)
    .set({
      status: "present",
      markedAt: firebase.firestore.FieldValue.serverTimestamp(),
      locationVerified: true,
      qrVerified: true,
      approved: false
    });

  await db.collection("audit_logs").add({
    userId: studentUid,
    action: "ATTENDANCE_MARKED",
    role: "student",
    details: "QR + Geo verified",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  attendanceStatus.textContent = "Attendance marked successfully!";
  loadAttendanceSummary();
}

// ==================== Attendance Prediction ====================
async function getPrediction() {
  const doc = await db.collection("predictions").doc(currentUser.uid).get();
  if (doc.exists) {
    predictionStatus.textContent = `Attendance: ${doc.data().attendancePercentage}% | Risk: ${doc.data().riskLevel}`;
  } else {
    predictionStatus.textContent = "Prediction not available.";
  }
}

// ==================== Request Correction ====================
async function requestCorrection() {
  const reason = prompt("Enter reason for correction:");
  if (!reason) return;

  const requestRef = db.collection("corrections").doc();
  await requestRef.set({
    studentId: currentUser.uid,
    classId: "dummy-class", // Replace dynamically
    date: formatDate(new Date()),
    reason: reason,
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: ""
  });

  correctionStatus.textContent = "Correction request sent!";
}

// ==================== Load Audit Logs ====================
async function loadAuditLogs() {
  const logs = await db.collection("audit_logs")
    .where("userId", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  auditLogsDiv.innerHTML = "";
  logs.forEach(log => {
    const div = document.createElement("div");
    div.textContent = `[${log.data().timestamp?.toDate().toLocaleString()}] ${log.data().action} - ${log.data().details}`;
    auditLogsDiv.appendChild(div);
  });
}

// ==================== Attendance Summary ====================
async function loadAttendanceSummary() {
  const attendanceCol = await db.collection("attendance")
    .doc("dummy-class") // Replace dynamically
    .collection(formatDate(new Date()))
    .get();

  const total = attendanceCol.size;
  let present = 0;
  attendanceCol.forEach(doc => {
    if (doc.data().status === "present") present++;
  });

  totalClassesElem.textContent = total;
  presentCountElem.textContent = present;
  attendancePercentageElem.textContent = total > 0 ? ((present / total) * 100).toFixed(2) + "%" : "0%";
}

// ==================== Load Today's Classes ====================
async function loadTodaysClasses() {
  const today = formatDate(new Date());
  // You can fetch from classes collection based on student's department/year
  todaysClassesDiv.innerHTML = `<p>No classes scheduled for today</p>`;
}

// ==================== Teacher Dashboard ====================
async function loadTeacherDashboard() {
  // Show classes, QR sessions, review corrections etc
  loadTodaysClasses();
  loadAuditLogs();
}

// ==================== Helpers ====================
function formatDate(date) {
  const yyyy = date.getFullYear();
  let mm = date.getMonth() + 1;
  let dd = date.getDate();
  if (dd < 10) dd = '0' + dd;
  if (mm < 10) mm = '0' + mm;
  return `${yyyy}-${mm}-${dd}`;
}
