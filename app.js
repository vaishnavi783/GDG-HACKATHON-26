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
const predictionStatus = document.getElementById("prediction-status");
const attendanceStatus = document.getElementById("attendance-status");
const correctionStatus = document.getElementById("correction-status");

let currentUser = null;

/* ===== UTILS ===== */
const todayDate = () => new Date().toISOString().split("T")[0];
const todayName = () => new Date().toLocaleString("en-US", { weekday: "long" });
const randomToken = () => Math.random().toString(36).substring(2, 10).toUpperCase();

/* ===== LOGIN ===== */
async function login() {
  try {
    const cred = await auth.signInWithEmailAndPassword(
      emailInput.value.trim(),
      passwordInput.value
    );

    const snap = await db.collection("users").doc(cred.user.uid).get();
    if (!snap.exists) throw "User profile missing";

    currentUser = { uid: cred.user.uid, ...snap.data() };

    if (currentUser.role.toLowerCase().trim() !== roleSelect.value.toLowerCase())
      throw "Role mismatch";

    logAudit("LOGIN");
    showDashboard();
  } catch (e) {
    document.getElementById("login-error").innerText = e;
  }
}

/* ===== LOGOUT ===== */
function logout() {
  auth.signOut();
  location.reload();
}

/* ===== DASHBOARD ===== */
function showDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");

  userEmail.innerText = currentUser.email;
  userRole.innerText = currentUser.role;
  quoteText.innerText = "Consistency beats motivation.";

  // Hide all role-specific cards initially
  document.querySelectorAll(".teacher-only, .student-only").forEach(el => el.classList.add("hidden"));

  if (currentUser.role.toLowerCase().trim() === "teacher") {
    document.querySelectorAll(".teacher-only").forEach(el => el.classList.remove("hidden"));
    loadEditableClasses();
    loadTeacherCorrections();
  }

  if (currentUser.role.toLowerCase().trim() === "student") {
    document.querySelectorAll(".student-only").forEach(el => el.classList.remove("hidden"));
    getPredictionSafe();
  }

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();
}

/* ===== TEACHER: GENERATE QR ===== */
async function generateQR() {
  qrOutput.innerHTML = "";
  const snap = await db.collection("classes").where("teacherID", "==", currentUser.uid).get();
  if (snap.empty) {
    qrOutput.innerHTML = "<p>No classes assigned</p>";
    return;
  }

  for (const d of snap.docs) {
    const token = randomToken();
    await db.collection("qr_sessions").add({
      classID: d.id,
      teacherID: currentUser.uid,
      qrToken: token,
      validFrom: Date.now(),
      validTill: Date.now() + 5 * 60 * 1000, // 5 mins
      active: true
    });
    qrOutput.innerHTML += `<p>${d.data().className} → <b>${token}</b></p>`;
  }

  logAudit("QR_CREATED");
}

/* ===== STUDENT: SCAN QR ===== */
async function scanQR() {
  if (!navigator.geolocation) { alert("Geolocation not supported"); return; }

  navigator.geolocation.getCurrentPosition(async pos => {
    const token = prompt("Enter QR token");
    if (!token) return;

    const snap = await db.collection("qr_sessions")
      .where("qrToken", "==", token)
      .where("active", "==", true)
      .get();

    if (snap.empty) { alert("Invalid or expired QR"); return; }

    const qr = snap.docs[0].data();
    if (qr.validTill < Date.now()) { alert("QR expired"); return; }

    const geoSnap = await db.collection("geo_fences").get();
    if (geoSnap.empty) { alert("No geo-fence defined"); return; }
    const geo = geoSnap.docs[0].data();

    const distance = Math.abs(pos.coords.latitude - geo.latitude) + Math.abs(pos.coords.longitude - geo.longitude);
    if (distance > geo.radius / 100000) { alert("Outside allowed location"); return; }

    await db.collection("attendance").add({
      studentID: currentUser.uid,
      classID: qr.classID,
      date: todayDate(),
      locationVerified: true,
      qrVerified: true,
      status: "present",
      markedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    attendanceStatus.innerText = "Attendance marked successfully ✅";
    logAudit("ATTENDANCE_MARKED");
  });
}

/* ===== STUDENT: REQUEST CORRECTION ===== */
async function requestCorrection(classID) {
  if (!classID) return;
  const reason = prompt("Enter reason for correction:");
  if (!reason) return alert("Correction reason is required");

  const classSnap = await db.collection("classes").doc(classID).get();
  if (!classSnap.exists) return alert("Class not found");

  await db.collection("corrections").add({
    studentID: currentUser.uid,
    classID,
    teacherID: classSnap.data().teacherID,
    reason,
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  correctionStatus.innerText = "Correction requested ✅";
  logAudit("CORRECTION_REQUESTED");
}

/* ===== TEACHER: LOAD / APPROVE / REJECT CORRECTIONS ===== */
async function loadTeacherCorrections() {
  correctionRequests.innerHTML = "";

  const snap = await db.collection("corrections").where("status", "==", "pending").get();
  const teacherCorrections = snap.docs.filter(d => d.data().teacherID === currentUser.uid);

  if (!teacherCorrections.length) {
    correctionRequests.innerHTML = "<p>No pending requests</p>";
    return;
  }

  teacherCorrections.forEach(d => {
    const data = d.data();
    const div = document.createElement("div");
    div.className = "correction-request";

    div.innerHTML = `
      <p>
        Class: ${data.classID} <br>
        Student: ${data.studentID} <br>
        Reason: ${data.reason || 'N/A'}
      </p>
    `;

    const approveBtn = document.createElement("button");
    approveBtn.innerText = "Approve";
    approveBtn.addEventListener("click", () => updateCorrection(d.id, "approved"));

    const rejectBtn = document.createElement("button");
    rejectBtn.innerText = "Reject";
    rejectBtn.addEventListener("click", () => updateCorrection(d.id, "rejected"));

    div.appendChild(approveBtn);
    div.appendChild(rejectBtn);
    correctionRequests.appendChild(div);
  });
}

async function updateCorrection(id, status) {
  await db.collection("corrections").doc(id).update({ status });
  logAudit("CORRECTION_" + status.toUpperCase());
  loadTeacherCorrections();
}

/* ===== TEACHER: EDIT CLASSES ===== */
async function loadEditableClasses() {
  editClasses.innerHTML = "";
  const snap = await db.collection("classes").where("teacherID", "==", currentUser.uid).get();
  if (snap.empty) { editClasses.innerHTML = "<p>No classes found</p>"; return; }

  snap.forEach(d => {
    const div = document.createElement("div");
    div.className = "class-edit";

    const input = document.createElement("input");
    input.value = d.data().className;

    const btn = document.createElement("button");
    btn.innerText = "Update";
    btn.addEventListener("click", async () => {
      const newName = input.value.trim();
      if (!newName) return alert("Class name cannot be empty");
      await db.collection("classes").doc(d.id).update({ className: newName });
      alert("Class updated ✅");
      logAudit("CLASS_UPDATED");
      loadEditableClasses();
    });

    div.appendChild(input);
    div.appendChild(btn);
    editClasses.appendChild(div);
  });
}

/* ===== STUDENT: ATTENDANCE PREDICTION ===== */
async function getPredictionSafe() {
  const doc = await db.collection("predictions").doc(currentUser.uid).get();
  predictionStatus.innerText = doc.exists ? doc.data().prediction : "No prediction data";
}

/* ===== TODAY CLASSES ===== */
async function loadTodayClasses() {
  todaysClasses.innerHTML = "";
  const snap = await db.collection("classes").get();
  let found = false;

  snap.forEach(d => {
    if ((d.data().days || []).includes(todayName())) {
      found = true;
      todaysClasses.innerHTML += `<p>${d.data().className}</p>`;
    }
  });

  if (!found) todaysClasses.innerHTML = "<p>No classes today</p>";
}

/* ===== AUDIT LOGS ===== */
function logAudit(action) {
  db.collection("audit_logs").add({
    userID: currentUser.uid,
    role: currentUser.role,
    action,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function loadAuditLogs() {
  auditLogs.innerHTML = "";
  const snap = await db.collection("audit_logs")
    .where("userID", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  snap.forEach(d => {
    auditLogs.innerHTML += `<p>${d.data().action}</p>`;
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

  google.charts.setOnLoadCallback(() => {
    const data = google.visualization.arrayToDataTable([
      ["Action", "Count"],
      ...Object.entries(map)
    ]);
    const chart = new google.visualization.PieChart(auditGraph);
    chart.draw(data, { height: 300 });
  });
}
