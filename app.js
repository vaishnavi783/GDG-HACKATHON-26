/* ================= GLOBAL ================= */
let currentUser = null;

/* ================= LOGIN ================= */
async function login() {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const selectedRole = document.getElementById("role").value;

    const cred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.collection("users").doc(cred.user.uid).get();

    if (!snap.exists) throw "User profile missing";

    currentUser = { uid: cred.user.uid, ...snap.data() };

    if (currentUser.role !== selectedRole) throw "Role mismatch";

    document.getElementById("login-page").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    document.getElementById("user-email").innerText = currentUser.email;
    document.getElementById("user-role").innerText = currentUser.role;

    toggleRoleUI();
    loadTodayClasses();
    loadAuditLogs();
    loadAuditGraph();

    if (currentUser.role === "teacher") {
      loadEditableClasses();
      loadTeacherCorrections();
    }
  } catch (e) {
    document.getElementById("login-error").innerText = e;
  }
}

/* ================= LOGOUT ================= */
function logout() {
  auth.signOut();
  location.reload();
}

/* ================= ROLE UI ================= */
function toggleRoleUI() {
  document.querySelectorAll(".teacher-only").forEach(el =>
    el.style.display = currentUser.role === "teacher" ? "block" : "none"
  );
  document.querySelectorAll(".student-only").forEach(el =>
    el.style.display = currentUser.role === "student" ? "block" : "none"
  );
}

/* ================= TEACHER: GENERATE QR ================= */
async function generateQR() {
  const snap = await db.collection("classes")
    .where("teacherID", "==", currentUser.uid)
    .get();

  const out = document.getElementById("qr-output");
  out.innerHTML = "";

  if (snap.empty) {
    out.innerText = "No classes assigned";
    return;
  }

  for (const d of snap.docs) {
    const token = Math.random().toString(36).substring(2, 8).toUpperCase();

    await db.collection("qr_sessions").add({
      classID: d.id,
      teacherID: currentUser.uid,
      qrToken: token,
      active: true,
      validTill: Date.now() + 5 * 60 * 1000
    });

    out.innerHTML += `<p>${d.data().className} → <b>${token}</b></p>`;
  }

  logAudit("QR_GENERATED");
}

/* ================= STUDENT: SCAN QR ================= */
async function scanQR() {
  const token = prompt("Enter QR Token");
  if (!token) return;

  const snap = await db.collection("qr_sessions")
    .where("qrToken", "==", token)
    .where("active", "==", true)
    .get();

  if (snap.empty) {
    document.getElementById("attendance-status").innerText = "Invalid / Expired QR";
    return;
  }

  const qr = snap.docs[0].data();

  await db.collection("attendance").add({
    studentID: currentUser.uid,
    classID: qr.classID,
    date: new Date().toISOString().split("T")[0],
    status: "present"
  });

  document.getElementById("attendance-status").innerText = "Attendance marked ✅";
  logAudit("ATTENDANCE_MARKED");
}

/* ================= STUDENT: REQUEST CORRECTION ================= */
async function requestCorrection() {
  const classID = document.getElementById("correction-class-id").value.trim();
  if (!classID) return;

  const cls = await db.collection("classes").doc(classID).get();
  if (!cls.exists) {
    document.getElementById("correction-status").innerText = "Invalid Class ID";
    return;
  }

  const reason = prompt("Enter reason for correction");
  if (!reason) return;

  await db.collection("corrections").add({
    classID,
    studentID: currentUser.uid,
    teacherID: cls.data().teacherID,
    reason,
    status: "pending"
  });

  document.getElementById("correction-status").innerText = "Request sent ✅";
  logAudit("CORRECTION_REQUESTED");
}

/* ================= TEACHER: LOAD CORRECTIONS ================= */
async function loadTeacherCorrections() {
  const box = document.getElementById("correction-requests");
  box.innerHTML = "";

  const snap = await db.collection("corrections")
    .where("teacherID", "==", currentUser.uid)
    .where("status", "==", "pending")
    .get();

  if (snap.empty) {
    box.innerText = "No pending requests";
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

    const a = document.createElement("button");
    a.innerText = "Approve";
    a.onclick = () => updateCorrection(d.id, c, "approved");

    const r = document.createElement("button");
    r.innerText = "Reject";
    r.onclick = () => updateCorrection(d.id, c, "rejected");

    div.append(a, r);
    box.appendChild(div);
  });
}

async function updateCorrection(id, data, status) {
  await db.collection("corrections").doc(id).update({ status });

  if (status === "approved") {
    await db.collection("attendance").add({
      studentID: data.studentID,
      classID: data.classID,
      date: new Date().toISOString().split("T")[0],
      status: "present",
      corrected: true
    });
  }

  logAudit("CORRECTION_" + status.toUpperCase());
  loadTeacherCorrections();
}

/* ================= TEACHER: EDIT CLASSES ================= */
async function loadEditableClasses() {
  const box = document.getElementById("edit-classes");
  box.innerHTML = "";

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

    box.append(input, btn);
  });
}

/* ================= TODAY CLASSES ================= */
async function loadTodayClasses() {
  const box = document.getElementById("todays-classes");
  box.innerHTML = "";

  const today = new Date().toLocaleString("en-US", { weekday: "long" });
  const snap = await db.collection("classes").get();

  let found = false;
  snap.forEach(d => {
    if ((d.data().days || []).includes(today)) {
      box.innerHTML += `<p>${d.data().className}</p>`;
      found = true;
    }
  });

  if (!found) box.innerText = "No classes today";
}

/* ================= PREDICTION ================= */
async function getPredictionSafe() {
  const snap = await db.collection("attendance")
    .where("studentID", "==", currentUser.uid)
    .get();

  document.getElementById("prediction-status").innerText =
    snap.size >= 5 ? "Good attendance 👍" : "Attendance at risk ⚠️";
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
  const box = document.getElementById("audit-logs");
  box.innerHTML = "";

  const snap = await db.collection("audit_logs")
    .where("userID", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  snap.forEach(d => box.innerHTML += `<p>${d.data().action}</p>`);
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
    new google.visualization.PieChart(
      document.getElementById("auditGraph")
    ).draw(data);
  });
}
