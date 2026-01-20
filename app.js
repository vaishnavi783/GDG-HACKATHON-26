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
function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function randomToken() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===== LOGIN ===== */
async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value.toLowerCase();
  const err = document.getElementById("login-error");

  err.classList.add("hidden");
  err.innerText = "";

  if (!email || !password) {
    err.innerText = "Please enter email and password";
    err.classList.remove("hidden");
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const doc = await db.collection("users").doc(cred.user.uid).get();

    if (!doc.exists) throw new Error("User profile not found");

    const dbRole = doc.data().role?.toLowerCase();
    if (dbRole !== role) throw new Error(`Role mismatch. Expected: ${dbRole}, got: ${role}`);

    currentUser = { uid: cred.user.uid, email: cred.user.email, ...doc.data() };
    console.log("Logged in user:", currentUser);

    logAudit("USER_LOGGED_IN");
    showDashboard();
  } catch (e) {
    console.error(e);
    err.innerText = e.message;
    err.classList.remove("hidden");
  }
}

function logout() {
  auth.signOut();
  location.reload();
}

/* ===== DASHBOARD ROLE SWITCH ===== */
function showDashboard() {
  if (!currentUser) return;

  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");

  userEmail.innerText = currentUser.email;
  userRole.innerText = currentUser.role;
  quoteText.innerText = "Consistency beats motivation.";

  // Hide all teacher/student tabs first
  document.querySelectorAll(".teacher-only, .student-only").forEach((e) => e.classList.add("hidden"));

  // TEACHER POV
  if (currentUser.role === "teacher") {
    console.log("Showing teacher tabs");
    document.querySelectorAll(".teacher-only").forEach((el) => el.classList.remove("hidden"));
    loadEditableClasses();
    loadTeacherCorrections();
  }

  // STUDENT POV
  if (currentUser.role === "student") {
    console.log("Showing student tabs");
    document.querySelectorAll(".student-only").forEach((el) => el.classList.remove("hidden"));
    getPrediction();
  }

  // Both roles see today's classes and audit logs
  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();
}

/* ===== TEACHER: QR GENERATION ===== */
async function generateQR() {
  if (!currentUser || currentUser.role !== "teacher") return;

  const snap = await db.collection("classes").where("teacherID", "==", currentUser.uid).get();
  if (snap.empty) {
    qrOutput.innerHTML = "<p>No classes assigned</p>";
    return;
  }

  let html = "";
  for (const d of snap.docs) {
    const token = randomToken();
    await db.collection("qr_sessions").add({
      classID: d.id,
      teacherID: currentUser.uid,
      qrToken: token,
      validFrom: firebase.firestore.FieldValue.serverTimestamp(),
      validTill: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
      active: true,
    });
    html += `<p><b>${d.data().className}</b>: ${token}</p>`;
    logAudit("QR_GENERATED");
  }
  qrOutput.innerHTML = html;
}

/* ===== TEACHER: EDIT CLASSES ===== */
async function loadEditableClasses() {
  if (!currentUser || currentUser.role !== "teacher") return;

  editClasses.innerHTML = "";
  const snap = await db.collection("classes").where("teacherID", "==", currentUser.uid).get();
  if (snap.empty) {
    editClasses.innerHTML = "<p>No classes to edit</p>";
    return;
  }

  snap.forEach((d) => {
    editClasses.innerHTML += `
      <p>
        <input id="class-${d.id}" value="${d.data().className}">
        <button onclick="updateClass('${d.id}')">Update</button>
      </p>
    `;
  });
}

async function updateClass(id) {
  if (!currentUser || currentUser.role !== "teacher") return;
  const val = document.getElementById(`class-${id}`).value;
  await db.collection("classes").doc(id).update({ className: val });
  logAudit("CLASS_UPDATED");
  loadEditableClasses();
}

/* ===== TEACHER: CORRECTION REQUESTS ===== */
async function loadTeacherCorrections() {
  if (!currentUser || currentUser.role !== "teacher") return;

  correctionRequests.innerHTML = "";
  const snap = await db.collection("corrections").where("status", "==", "pending").get();

  for (const d of snap.docs) {
    const classDoc = await db.collection("classes").doc(d.data().classID).get();
    if (classDoc.exists && classDoc.data().teacherID === currentUser.uid) {
      correctionRequests.innerHTML += `
        <p>
          ${d.data().studentID || d.data().studentId} - ${classDoc.data().className}
          <button onclick="approveCorrection('${d.id}')">Approve</button>
        </p>
      `;
    }
  }
}

async function approveCorrection(id) {
  if (!currentUser || currentUser.role !== "teacher") return;
  await db.collection("corrections").doc(id).update({
    status: "approved",
    reviewedBy: currentUser.uid,
  });
  logAudit("CORRECTION_APPROVED");
  loadTeacherCorrections();
}

/* ===== TODAY CLASSES (BOTH POVS) ===== */
async function loadTodayClasses() {
  if (!currentUser) return;
  todaysClasses.innerHTML = "";

  let q;
  if (currentUser.role === "teacher") {
    q = db.collection("classes").where("teacherID", "==", currentUser.uid);
  } else if (currentUser.role === "student") {
    const dept = currentUser.department || "";
    const yr = currentUser.year || "";
    q = db.collection("classes").where("department", "==", dept).where("year", "==", yr);
  }

  const snap = await q.get();
  if (snap.empty) {
    todaysClasses.innerHTML = "<p>No classes today</p>";
    return;
  }

  snap.forEach((d) => {
    todaysClasses.innerHTML += `<p>${d.data().className}</p>`;
  });
}

/* ===== AUDIT LOGS ===== */
async function loadAuditLogs() {
  if (!currentUser) return;
  auditLogs.innerHTML = "";

  const snap = await db
    .collection("audit_logs")
    .where("userId", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  snap.forEach((d) => {
    auditLogs.innerHTML += `<p>${d.data().action}</p>`;
  });
}

function logAudit(action) {
  if (!currentUser) return;
  db.collection("audit_logs").add({
    userId: currentUser.uid,
    role: currentUser.role,
    action,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

/* ===== AUDIT GRAPH ===== */
google.charts.load("current", { packages: ["corechart"] });
async function loadAuditGraph() {
  if (!currentUser) return;
  const snap = await db.collection("audit_logs").get();
  const map = {};

  snap.forEach((d) => {
    const action = d.data().action;
    map[action] = (map[action] || 0) + 1;
  });

  const rows = [["Action", "Count"]];
  Object.entries(map).forEach(([a, c]) => rows.push([a, c]));

  google.charts.setOnLoadCallback(() => {
    const chart = new google.visualization.PieChart(auditGraph);
    chart.draw(google.visualization.arrayToDataTable(rows));
  });
}
