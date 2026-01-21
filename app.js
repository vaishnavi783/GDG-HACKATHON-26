/* ================= GLOBAL ERROR SAFETY ================= */
window.onerror = (msg, src, line) => {
  console.error("UI Error:", msg, "Line:", line);
};

/* ================= DOM REFERENCES ================= */
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

/* ================= UTILS ================= */
const todayDate = () => new Date().toISOString().split("T")[0];
const todayName = () => new Date().toLocaleString("en-US", { weekday: "long" });
const randomToken = () => Math.random().toString(36).substring(2, 10).toUpperCase();

/* ================= LOGIN ================= */
async function login() {
  try {
    const cred = await auth.signInWithEmailAndPassword(
      emailInput.value.trim(),
      passwordInput.value
    );

    const snap = await db.collection("users").doc(cred.user.uid).get();
    if (!snap.exists) throw "User profile missing";

    currentUser = { uid: cred.user.uid, ...snap.data() };

    if (currentUser.role !== roleSelect.value)
      throw "Role mismatch";

    logAudit("LOGIN");
    showDashboard();
  } catch (e) {
    document.getElementById("login-error").innerText = e;
  }
}

/* ================= LOGOUT ================= */
function logout() {
  auth.signOut();
  location.reload();
}

/* ================= DASHBOARD ================= */
function showDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");

  userEmail.innerText = currentUser.email;
  userRole.innerText = currentUser.role;
  quoteText.innerText = "Consistency beats motivation.";

  document.querySelectorAll(".teacher-only,.student-only")
    .forEach(el => el.style.display = "none");

  if (currentUser.role === "teacher") {
    document.querySelectorAll(".teacher-only")
      .forEach(el => el.style.display = "block");
    loadEditableClasses();
    loadTeacherCorrections();
  }

  if (currentUser.role === "student") {
    document.querySelectorAll(".student-only")
      .forEach(el => el.style.display = "block");
  }

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();
}

/* ================= TEACHER: GENERATE QR ================= */
async function generateQR() {
  qrOutput.innerHTML = "";

  const snap = await db.collection("classes")
    .where("teacherID", "==", currentUser.uid)
    .get();

  if (snap.empty) {
    qrOutput.innerHTML = "No classes assigned";
    return;
  }

  for (const d of snap.docs) {
    // deactivate old QRs
    const old = await db.collection("qr_sessions")
      .where("classID", "==", d.id)
      .get();

    old.forEach(q => q.ref.update({ active: false }));

    const token = randomToken();

    await db.collection("qr_sessions").add({
      classID: d.id,
      teacherID: currentUser.uid,
      qrToken: token,
      validTill: Date.now() + 5 * 60 * 1000,
      active: true
    });

    qrOutput.innerHTML += `<p>${d.data().className} → <b>${token}</b></p>`;
  }

  logAudit("QR_CREATED");
}

/* ================= STUDENT: SCAN QR ================= */
async function scanQR() {
  const token = prompt("Enter QR token");
  if (!token) return;

  const snap = await db.collection("qr_sessions")
    .where("qrToken", "==", token)
    .where("active", "==", true)
    .get();

  if (snap.empty) return alert("Invalid or expired QR");

  const qr = snap.docs[0].data();

  await db.collection("attendance").add({
    studentID: currentUser.uid,
    classID: qr.classID,
    date: todayDate(),
    status: "present",
    markedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  attendanceStatus.innerText = "Attendance marked ✅";
  logAudit("ATTENDANCE_MARKED");
}

/* ================= STUDENT: REQUEST CORRECTION ================= */
async function requestCorrection() {
  const classID = document.getElementById("correction-class-id").value.trim();
  if (!classID) return alert("Enter Class ID");

  const reason = prompt("Enter reason");
  if (!reason) return;

  const cls = await db.collection("classes").doc(classID).get();
  if (!cls.exists) return alert("Invalid class");

  await db.collection("corrections").add({
    studentID: currentUser.uid,
    classID,
    teacherID: cls.data().teacherID,
    reason,
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  correctionStatus.innerText = "Correction requested ✅";
  logAudit("CORRECTION_REQUESTED");
}

/* ================= TEACHER: CORRECTIONS ================= */
async function loadTeacherCorrections() {
  correctionRequests.innerHTML = "";

  const snap = await db.collection("corrections")
    .where("teacherID", "==", currentUser.uid)
    .where("status", "==", "pending")
    .get();

  if (snap.empty) {
    correctionRequests.innerHTML = "No pending requests";
    return;
  }

  snap.forEach(d => {
    const c = d.data();

    const div = document.createElement("div");
    div.innerHTML = `
      <p>
        Class: ${c.classID}<br>
        Student: ${c.studentID}<br>
        Reason: ${c.reason}
      </p>
    `;

    const approve = document.createElement("button");
    approve.innerText = "Approve";
    approve.onclick = () => updateCorrection(d.id, c, "approved");

    const reject = document.createElement("button");
    reject.innerText = "Reject";
    reject.onclick = () => updateCorrection(d.id, c, "rejected");

    div.append(approve, reject);
    correctionRequests.appendChild(div);
  });
}

async function updateCorrection(id, data, status) {
  await db.collection("corrections").doc(id).update({ status });

  if (status === "approved") {
    await db.collection("attendance").add({
      studentID: data.studentID,
      classID: data.classID,
      date: todayDate(),
      status: "present",
      corrected: true
    });
  }

  logAudit("CORRECTION_" + status.toUpperCase());
  loadTeacherCorrections();
}

/* ================= EDIT CLASSES ================= */
async function loadEditableClasses() {
  editClasses.innerHTML = "";

  const snap = await db.collection("classes")
    .where("teacherID", "==", currentUser.uid)
    .get();

  snap.forEach(d => {
    const input = document.createElement("input");
    input.value = d.data().className;

    const btn = document.createElement("button");
    btn.innerText = "Update";
    btn.onclick = async () => {
      await d.ref.update({ className: input.value });
      logAudit("CLASS_UPDATED");
    };

    editClasses.append(input, btn);
  });
}

/* ================= TODAY CLASSES ================= */
async function loadTodayClasses() {
  todaysClasses.innerHTML = "";

  const snap = await db.collection("classes").get();
  let found = false;

  snap.forEach(d => {
    if ((d.data().days || []).includes(todayName())) {
      todaysClasses.innerHTML += `<p>${d.data().className}</p>`;
      found = true;
    }
  });

  if (!found) todaysClasses.innerHTML = "No classes today";
}

/* ================= AUDIT ================= */
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

  snap.forEach(d => auditLogs.innerHTML += `<p>${d.data().action}</p>`);
}

/* ================= AUDIT GRAPH ================= */
google.charts.load("current", { packages: ["corechart"] });
async function loadAuditGraph() {
  const snap = await db.collection("audit_logs")
    .where("userID", "==", currentUser.uid)
    .get();

  const map = {};
  snap.forEach(d => map[d.data().action] = (map[d.data().action] || 0) + 1);

  google.charts.setOnLoadCallback(() => {
    const data = google.visualization.arrayToDataTable([
      ["Action", "Count"],
      ...Object.entries(map)
    ]);
    new google.visualization.PieChart(auditGraph).draw(data);
  });
}
