/* ===== GLOBAL ERROR SAFETY ===== */
window.onerror = (msg, src, line) => {
  console.error("UI Error:", msg, "Line:", line);
};

/* ===== DOM REFERENCES ===== */
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const roleSelect = document.getElementById("role");

const loginPage = document.getElementById("login-page");
const dashboard = document.getElementById("dashboard");

const userEmail = document.getElementById("user-email");
const userRole = document.getElementById("user-role");
const quoteText = document.getElementById("quoteText");

const qrOutput = document.getElementById("qr-output");
const editClasses = document.getElementById("edit-classes");
const todaysClasses = document.getElementById("todays-classes");
const auditLogs = document.getElementById("audit-logs");
const auditGraph = document.getElementById("auditGraph");
const correctionRequests = document.getElementById("correction-requests");
const statusEl = document.getElementById("prediction-status");

let currentUser = null;

/* ===== UTILS ===== */
const todayDate = () => new Date().toISOString().split("T")[0];
const todayName = () => new Date().toLocaleString("en-US", { weekday: "long" });
const randomToken = () => Math.random().toString(36).substring(2, 10).toUpperCase();

/* ===== LOGIN ===== */
async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value.toLowerCase();
  const err = document.getElementById("login-error");

  err.innerText = "";

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.collection("users").doc(cred.user.uid).get();

    if (!snap.exists) throw "User profile missing";

    if (snap.data().role.toLowerCase() !== role) throw "Role mismatch";

    currentUser = { uid: cred.user.uid, ...snap.data() };
    logAudit("LOGIN");
    showDashboard();
  } catch (e) {
    err.innerText = e;
  }
}

/* ===== DASHBOARD ===== */
function showDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");

  userEmail.innerText = currentUser.email;
  userRole.innerText = currentUser.role;
  quoteText.innerText = "Consistency beats motivation.";

  document.querySelectorAll(".teacher-only,.student-only")
    .forEach(e => e.classList.add("hidden"));

  if (currentUser.role === "teacher") {
    document.querySelectorAll(".teacher-only").forEach(e => e.classList.remove("hidden"));
    loadEditableClasses();
    loadTeacherCorrections();
  }

  if (currentUser.role === "student") {
    document.querySelectorAll(".student-only").forEach(e => e.classList.remove("hidden"));
    getPredictionSafe();
  }

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();
}

/* ===== TEACHER: GENERATE QR ===== */
async function generateQR() {
  const snap = await db.collection("classes")
    .where("teacherID", "==", currentUser.uid)
    .get();

  if (snap.empty) {
    qrOutput.innerHTML = "<p>No classes assigned</p>";
    return;
  }

  qrOutput.innerHTML = "";

  for (const d of snap.docs) {
    const token = randomToken();

    await db.collection("qr_sessions").add({
      classID: d.id,
      teacherID: currentUser.uid,
      qrToken: token,
      expiresAt: Date.now() + 5 * 60 * 1000,
      active: true
    });

    qrOutput.innerHTML += `<p><b>${d.data().className}</b>: ${token}</p>`;
  }

  logAudit("QR_CREATED");
}

/* ===== STUDENT: SCAN QR ===== */
async function scanQR() {
  const token = prompt("Enter QR token");
  if (!token) return;

  const snap = await db.collection("qr_sessions")
    .where("qrToken", "==", token)
    .where("active", "==", true)
    .get();

  if (snap.empty) {
    alert("Invalid or expired QR");
    return;
  }

  const qr = snap.docs[0];

  if (qr.data().expiresAt < Date.now()) {
    alert("QR expired");
    return;
  }

  await db.collection("attendance").add({
    studentID: currentUser.uid,
    classID: qr.data().classID,
    date: todayDate(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Attendance marked");
  logAudit("ATTENDANCE_MARKED");
}

/* ===== STUDENT: REQUEST CORRECTION ===== */
async function requestCorrection(classID) {
  await db.collection("corrections").add({
    studentID: currentUser.uid,
    classID,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Correction requested");
}

/* ===== PREDICTION ===== */
async function getPredictionSafe() {
  try {
    const doc = await db.collection("predictions").doc(currentUser.uid).get();
    statusEl.innerText = doc.exists ? doc.data().prediction : "No prediction";
  } catch {
    statusEl.innerText = "Prediction unavailable";
  }
}

/* ===== TODAY CLASSES ===== */
async function loadTodayClasses() {
  todaysClasses.innerHTML = "";
  const today = todayName();

  const q = currentUser.role === "teacher"
    ? db.collection("classes").where("teacherID", "==", currentUser.uid)
    : db.collection("classes")
        .where("department", "==", currentUser.department)
        .where("year", "==", currentUser.year);

  const snap = await q.get();
  let found = false;

  snap.forEach(d => {
    if ((d.data().days || []).includes(today)) {
      found = true;
      todaysClasses.innerHTML += `<p>${d.data().className}</p>`;
    }
  });

  if (!found) todaysClasses.innerHTML = "<p>No classes today</p>";
}

/* ===== AUDIT ===== */
function logAudit(action) {
  db.collection("audit_logs").add({
    userId: currentUser.uid,
    role: currentUser.role,
    action,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function loadAuditLogs() {
  auditLogs.innerHTML = "";
  const snap = await db.collection("audit_logs")
    .where("userId", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  snap.forEach(d => {
    auditLogs.innerHTML += `<p>${d.data().action}</p>`;
  });
}

/* ===== GRAPH ===== */
google.charts.load("current", { packages: ["corechart"] });
async function loadAuditGraph() {
  const snap = await db.collection("audit_logs").get();
  const map = {};

  snap.forEach(d => {
    map[d.data().action] = (map[d.data().action] || 0) + 1;
  });

  const rows = [["Action", "Count"], ...Object.entries(map)];
  google.charts.setOnLoadCallback(() => {
    new google.visualization.PieChart(auditGraph)
      .draw(google.visualization.arrayToDataTable(rows));
  });
}
