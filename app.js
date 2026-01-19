// ================= GLOBAL =================
let currentUser = null;

// ================= UTILS =================
function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function randomToken() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Haversine distance (meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================= LOGIN =================
async function login() {
  const emailVal = document.getElementById("email").value.trim();
  const passwordVal = document.getElementById("password").value;
  const roleVal = document.getElementById("role").value;
  const err = document.getElementById("login-error");

  err.style.display = "none";

  try {
    const cred = await auth.signInWithEmailAndPassword(emailVal, passwordVal);
    const snap = await db.collection("users").doc(cred.user.uid).get();

    if (!snap.exists || snap.data().role !== roleVal)
      throw "Role mismatch";

    currentUser = { uid: cred.user.uid, ...snap.data() };
    showDashboard();
  } catch (e) {
    err.innerText = e;
    err.style.display = "block";
  }
}

function logout() {
  auth.signOut();
  location.reload();
}

// ================= DASHBOARD =================
function showDashboard() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("dashboard").style.display = "block";

  document.getElementById("user-email").innerText = currentUser.email;
  document.getElementById("user-role").innerText = currentUser.role;
  document.getElementById("quoteText").innerText =
    "Consistency beats motivation.";

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();

  if (currentUser.role === "teacher") {
    document.querySelectorAll(".teacher-only")
      .forEach(el => el.style.display = "block");
    loadCorrections();
  }
}

// ================= TEACHER: GENERATE QR =================
async function generateQR() {
  const clsSnap = await db.collection("classes")
    .where("teacherId", "==", currentUser.uid).get();

  if (clsSnap.empty) return alert("No classes assigned");

  const cls = clsSnap.docs[0];
  const token = randomToken();

  await db.collection("qr_sessions").add({
    classId: cls.id,
    teacherId: currentUser.uid,
    qrToken: token,
    validFrom: firebase.firestore.Timestamp.now(),
    validTill: firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() + 5 * 60000)
    ),
    active: true
  });

  document.getElementById("qr-output").innerHTML =
    `<b>QR Token:</b> ${token}`;

  logAudit("QR_GENERATED");
}

// ================= STUDENT: MARK ATTENDANCE =================
async function markAttendance() {
  const status = document.getElementById("attendance-status");

  if (!navigator.geolocation)
    return status.innerText = "Location not supported";

  navigator.geolocation.getCurrentPosition(async pos => {
    const geoSnap = await db.collection("geo_fences").doc("college").get();
    const g = geoSnap.data();

    const distance = getDistance(
      pos.coords.latitude,
      pos.coords.longitude,
      g.latitude,
      g.longitude
    );

    if (distance > g.radius + 50)
      return status.innerText =
        `Outside campus (${Math.round(distance)}m)`;

    const qrSnap = await db.collection("qr_sessions")
      .where("active", "==", true).get();

    if (qrSnap.empty)
      return status.innerText = "No active QR session";

    const q = qrSnap.docs[0];

    await db.collection("attendance")
      .doc(q.data().classId)
      .collection(todayDate())
      .doc(currentUser.uid)
      .set({
        status: "present",
        markedAt: firebase.firestore.FieldValue.serverTimestamp(),
        locationVerified: true,
        qrVerified: true,
        approved: false
      });

    logAudit("ATTENDANCE_MARKED");
    status.innerText = "Attendance marked successfully";
  },
  () => status.innerText = "Location permission denied",
  { enableHighAccuracy: true });
}

// ================= STUDENT: PREDICTION =================
async function getPrediction() {
  const el = document.getElementById("prediction-status");
  const snap = await db.collection("predictions")
    .doc(currentUser.uid).get();

  if (!snap.exists) return el.innerText = "No prediction available";

  const d = snap.data();
  el.innerText = `${d.attendancePercentage}% — ${d.riskLevel}`;
}

// ================= STUDENT: CORRECTION REQUEST =================
async function requestCorrection() {
  const cls = prompt("Class ID");
  const date = prompt("Date (YYYY-MM-DD)");
  const reason = prompt("Reason");

  await db.collection("corrections").add({
    studentId: currentUser.uid,
    classId: cls,
    date,
    reason,
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: ""
  });

  logAudit("CORRECTION_REQUESTED");
}

// ================= TEACHER: VIEW & APPROVE =================
async function loadCorrections() {
  const box = document.getElementById("correction-requests");
  const snap = await db.collection("corrections")
    .where("status", "==", "pending").get();

  box.innerHTML = "";

  snap.forEach(d => {
    const c = d.data();
    box.innerHTML += `
      <p>${c.studentId}: ${c.reason}
      <button onclick="approveCorrection('${d.id}')">Approve</button></p>`;
  });
}

async function approveCorrection(id) {
  await db.collection("corrections").doc(id).update({
    status: "approved",
    reviewedBy: currentUser.uid
  });

  logAudit("CORRECTION_APPROVED");
  loadCorrections();
}

// ================= TODAY'S CLASSES =================
async function loadTodayClasses() {
  const box = document.getElementById("todays-classes");

  const ref = currentUser.role === "teacher"
    ? db.collection("classes").where("teacherId", "==", currentUser.uid)
    : db.collection("classes")
        .where("department", "==", currentUser.department)
        .where("year", "==", currentUser.year);

  const snap = await ref.get();
  box.innerHTML = "";

  snap.forEach(d => {
    const c = d.data();
    box.innerHTML += `<p>${c.className} (${c.startTime}-${c.endTime})</p>`;
  });
}

// ================= AUDIT LOGS =================
async function loadAuditLogs() {
  const box = document.getElementById("audit-logs");

  const snap = await db.collection("audit_logs")
    .where("userId", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  box.innerHTML = "";
  snap.forEach(d => {
    box.innerHTML += `<p>${d.data().action}</p>`;
  });
}

// ================= AUDIT GRAPH =================
google.charts.load("current", { packages: ["corechart"] });

async function loadAuditGraph() {
  const snap = await db.collection("audit_logs").get();
  const map = {};

  snap.forEach(d => {
    map[d.data().action] = (map[d.data().action] || 0) + 1;
  });

  const rows = [["Action", "Count"]];
  Object.entries(map).forEach(([k, v]) => rows.push([k, v]));

  google.charts.setOnLoadCallback(() => {
    const chart = new google.visualization.PieChart(
      document.getElementById("auditGraph")
    );
    chart.draw(google.visualization.arrayToDataTable(rows), {
      title: "Audit Activity"
    });
  });
}

// ================= AUDIT HELPER =================
function logAudit(action) {
  db.collection("audit_logs").add({
    userId: currentUser.uid,
    role: currentUser.role,
    action,
    details: "",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
