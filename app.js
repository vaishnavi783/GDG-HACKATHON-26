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
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===== LOGIN ===== */
async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value.toLowerCase();
  const err = document.getElementById("login-error");
  err.style.display = "none";
  err.innerText = "";

  if (!email || !password) {
    err.innerText = "Please enter email and password";
    err.style.display = "block";
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const doc = await db.collection("users").doc(cred.user.uid).get();
    if (!doc.exists) throw new Error("User profile not found");

    if (doc.data().role.toLowerCase() !== role)
      throw new Error("Role mismatch");

    currentUser = { uid: cred.user.uid, email: cred.user.email, ...doc.data() };

    logAudit("USER_LOGGED_IN");
    showDashboard();
  } catch (e) {
    console.error(e);
    err.innerText = e.message;
    err.style.display = "block";
  }
}

function logout() {
  auth.signOut();
  location.reload();
}

/* ===== DASHBOARD ===== */
function showDashboard() {
  loginPage.style.display = "none";
  dashboard.style.display = "block";

  userEmail.innerText = currentUser.email;
  userRole.innerText = currentUser.role;
  quoteText.innerText = "Consistency beats motivation.";

  document.querySelectorAll(".teacher-only").forEach(e => (e.style.display = "none"));
  document.querySelectorAll(".student-only").forEach(e => (e.style.display = "none"));

  if (currentUser.role === "teacher") {
    document.querySelectorAll(".teacher-only").forEach(e => (e.style.display = "block"));
    loadCorrections();
    loadEditableClasses();
  } else {
    document.querySelectorAll(".student-only").forEach(e => (e.style.display = "block"));
    getPrediction(); // auto-load student prediction
  }

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();
}

/* ===== QR ===== */
async function generateQR() {
  const snap = await db.collection("classes").where("teacherId", "==", currentUser.uid).get();
  let html = "";
  for (const d of snap.docs) {
    const token = randomToken();
    await db.collection("qr_sessions").add({
      classId: d.id,
      teacherId: currentUser.uid,
      qrToken: token,
      validFrom: firebase.firestore.FieldValue.serverTimestamp(),
      validTill: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
      active: true
    });
    html += `<p><b>${d.data().className}:</b> ${token}</p>`;
    logAudit("QR_GENERATED");
  }
  qrOutput.innerHTML = html;
}

/* ===== EDIT CLASSES ===== */
async function loadEditableClasses() {
  editClasses.innerHTML = "";
  const snap = await db.collection("classes").where("teacherId", "==", currentUser.uid).get();
  snap.forEach(d => {
    editClasses.innerHTML += `
      <p>
        <input id="class-${d.id}" value="${d.data().className}">
        <button onclick="updateClass('${d.id}')">Update</button>
      </p>`;
  });
}

async function updateClass(id) {
  const val = document.getElementById(`class-${id}`).value;
  await db.collection("classes").doc(id).update({ className: val });
  logAudit("CLASS_UPDATED");
}

/* ===== TODAY CLASSES ===== */
async function loadTodayClasses() {
  todaysClasses.innerHTML = "";
  let q =
    currentUser.role === "teacher"
      ? db.collection("classes").where("teacherId", "==", currentUser.uid)
      : db.collection("classes")
          .where("department", "==", currentUser.department)
          .where("year", "==", currentUser.year);

  const snap = await q.get();
  if (snap.empty) {
    todaysClasses.innerHTML = "<p>No classes scheduled for today</p>";
    return;
  }

  snap.forEach(d => {
    todaysClasses.innerHTML += `<p>${d.data().className}</p>`;
  });
}

/* ===== AUDIT LOGS ===== */
async function loadAuditLogs() {
  auditLogs.innerHTML = "";
  const snap = await db.collection("audit_logs")
    .where("userId", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10).get();
  snap.forEach(d => {
    auditLogs.innerHTML += `<p>${d.data().action}</p>`;
  });
}

function logAudit(action) {
  db.collection("audit_logs").add({
    userId: currentUser.uid,
    role: currentUser.role,
    action,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/* ===== AUDIT GRAPH ===== */
google.charts.load("current", { packages: ["corechart"] });
async function loadAuditGraph() {
  const snap = await db.collection("audit_logs").get();
  const map = {};
  snap.forEach(d => {
    const action = d.data().action;
    map[action] = (map[action] || 0) + 1;
  });

  const rows = [["Action", "Count"]];
  Object.entries(map).forEach(([action, count]) => rows.push([action, count]));

  google.charts.setOnLoadCallback(() => {
    const chart = new google.visualization.PieChart(auditGraph);
    chart.draw(google.visualization.arrayToDataTable(rows));
  });
}

/* ===== ATTENDANCE ===== */
async function markAttendance() {
  const token = prompt("Enter QR Token");
  if (!token) return;

  const snap = await db.collection("qr_sessions")
    .where("qrToken", "==", token)
    .where("active", "==", true).get();
  if (snap.empty) return alert("Invalid QR");

  const geo = (await db.collection("geo_fences").doc("college").get()).data();
  navigator.geolocation.getCurrentPosition(async pos => {
    const d = getDistance(pos.coords.latitude, pos.coords.longitude, geo.latitude, geo.longitude);
    if (d > geo.radius) return alert("Outside geofence");

    await db.collection("attendance").add({
      studentUid: currentUser.uid,
      classId: snap.docs[0].data().classId,
      date: todayDate(),
      status: "present",
      markedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    logAudit("ATTENDANCE_MARKED");
    alert("Attendance marked");
  }, () => alert("Location access denied"));
}

/* ===== CORRECTIONS ===== */
async function requestCorrection() {
  const classId = prompt("Class ID");
  if (!classId) return;

  await db.collection("corrections").add({
    studentId: currentUser.uid,
    classId,
    date: todayDate(),
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  logAudit("CORRECTION_REQUESTED");
}

async function loadCorrections() {
  correctionRequests.innerHTML = "";
  const snap = await db.collection("corrections").where("status", "==", "pending").get();
  snap.forEach(d => {
    correctionRequests.innerHTML += `
      <p>${d.data().studentId} <button onclick="approveCorrection('${d.id}')">Approve</button></p>`;
  });
}

async function approveCorrection(id) {
  await db.collection("corrections").doc(id).update({
    status: "approved",
    reviewedBy: currentUser.uid
  });
  logAudit("CORRECTION_APPROVED");
}

/* ===== ATTENDANCE PREDICTION ===== */
async function getPrediction() {
  if (currentUser.role !== "student") return;

  statusEl.innerText = "Calculating...";
  try {
    const classesSnap = await db.collection("classes")
      .where("department", "==", currentUser.department)
      .where("year", "==", currentUser.year)
      .get();

    const totalClasses = classesSnap.size;
    if (totalClasses === 0) {
      statusEl.innerText = "No class data available";
      return;
    }

    const attendanceSnap = await db.collection("attendance")
      .where("studentUid", "==", currentUser.uid)
      .get();

    const attended = attendanceSnap.size;
    const percentage = Math.round((attended / totalClasses) * 100);

    let prediction;
    if (percentage >= 75) prediction = "✅ Safe";
    else if (percentage >= 60) prediction = "⚠️ At Risk";
    else prediction = "❌ Critical";

    await db.collection("predictions").doc(currentUser.uid).set({
      studentUid: currentUser.uid,
      attendancePercentage: percentage,
      prediction,
      calculatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    statusEl.innerHTML = `Attendance: <b>${percentage}%</b><br>Status: <b>${prediction}</b>`;
    logAudit("PREDICTION_VIEWED");
  } catch (err) {
    statusEl.innerText = "Prediction failed";
    console.error(err);
  }
}
