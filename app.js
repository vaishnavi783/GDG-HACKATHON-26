// ---------------- Firebase Init ----------------
const firebaseConfig = {
  apiKey: "AIzaSyDehcanIPU9BuOuI7qOFjW7cAFXRSExIB0",
  authDomain: "attendx-6be15.firebaseapp.com",
  projectId: "attendx-6be15",
  storageBucket: "attendx-6be15.appspot.com",
  messagingSenderId: "593387890331",
  appId: "1:593387890331:web:f11e81a9ac30f23dbc083e"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// ---------------- Login ----------------
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      currentUser = userCredential.user;
      db.collection("users").doc(currentUser.uid).get().then(doc => {
        const role = doc.data().role;
        if (role === "student") showStudentDashboard(doc.data());
        else if (role === "teacher") showTeacherDashboard(doc.data());
      });
    })
    .catch(err => alert("Login failed: " + err.message));
}

// ---------------- Student Dashboard ----------------
function showStudentDashboard(user) {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("studentDashboard").classList.remove("hidden");
  document.getElementById("studentName").innerText = `Welcome ${user.name}`;
  loadAttendanceHistory();
}

async function markAttendance() {
  // 1️⃣ Get student location
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // 2️⃣ Get geo fence
    const geoSnap = await db.collection("geo_fences").doc("college").get();
    const geo = geoSnap.data();
    const distance = getDistance(lat, lon, geo.latitude, geo.longitude);
    const insideCollege = distance <= geo.radius;

    if (!insideCollege) return alert("You are outside the allowed area. Attendance not marked.");

    // 3️⃣ Get today date and mark attendance
    const today = new Date().toISOString().split("T")[0];
    const classId = "DBMS"; // Example
    await db.collection("attendance").doc(classId)
      .collection(today)
      .doc(currentUser.uid)
      .set({
        status: "present",
        markedAt: firebase.firestore.FieldValue.serverTimestamp(),
        locationVerified: insideCollege,
        qrVerified: false, // QR code verification can be added separately
        approved: false
      });

    // 4️⃣ Add audit log
    await db.collection("audit_logs").add({
      userId: currentUser.uid,
      action: "ATTENDANCE_MARKED",
      role: "student",
      details: "Geo verified",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Attendance marked successfully!");
    loadAttendanceHistory();
  });
}

// Haversine formula for distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Attendance history
async function loadAttendanceHistory() {
  const today = new Date().toISOString().split("T")[0];
  const classId = "DBMS";
  const historyDiv = document.getElementById("history");
  historyDiv.innerHTML = "";

  const snapshot = await db.collection("attendance").doc(classId)
    .collection(today)
    .doc(currentUser.uid)
    .get();

  if (snapshot.exists) {
    const data = snapshot.data();
    historyDiv.innerText = `${today}: ${data.status} (Approved: ${data.approved})`;
  } else {
    historyDiv.innerText = "No attendance yet today.";
  }
}

// Request correction
async function requestCorrection() {
  const reason = document.getElementById("reason").value;
  const today = new Date().toISOString().split("T")[0];
  const classId = "DBMS";

  await db.collection("corrections").add({
    studentId: currentUser.uid,
    classId,
    date: today,
    reason,
    status: "pending",
    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: ""
  });

  alert("Correction requested!");
  document.getElementById("reason").value = "";
}

// ---------------- Teacher Dashboard ----------------
function showTeacherDashboard(user) {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("teacherDashboard").classList.remove("hidden");
  document.getElementById("teacherName").innerText = `Welcome ${user.name}`;
  loadCorrections();
  loadAuditLogs();
}

// Load pending corrections
async function loadCorrections() {
  const snapshot = await db.collection("corrections").where("status", "==", "pending").get();
  const div = document.getElementById("corrections");
  div.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();
    const el = document.createElement("div");
    el.innerHTML = `
      ${data.studentId} - ${data.date} - ${data.reason} 
      <button onclick="approveCorrection('${doc.id}', '${data.studentId}', '${data.classId}', '${data.date}')">Approve</button>
      <button onclick="rejectCorrection('${doc.id}')">Reject</button>
    `;
    div.appendChild(el);
  });
}

// Approve correction
async function approveCorrection(docId, studentId, classId, date) {
  await db.collection("corrections").doc(docId).update({
    status: "approved",
    reviewedBy: currentUser.uid
  });
  await db.collection("attendance").doc(classId).collection(date).doc(studentId).update({
    status: "present",
    approved: true
  });
  alert("Correction approved!");
  loadCorrections();
  loadAuditLogs();
}

// Reject correction
async function rejectCorrection(docId) {
  await db.collection("corrections").doc(docId).update({
    status: "rejected",
    reviewedBy: currentUser.uid
  });
  alert("Correction rejected!");
  loadCorrections();
  loadAuditLogs();
}

// Load audit logs
async function loadAuditLogs() {
  const snapshot = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(10).get();
  const div = document.getElementById("auditLogs");
  div.innerHTML = "";
  snapshot.forEach(doc => {
    const data = doc.data();
    div.innerHTML += `<p>${data.userId} - ${data.action} - ${data.details}</p>`;
  });
}

// ---------------- QR Session ----------------
async function createQRSession() {
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = firebase.firestore.Timestamp.now();
  const tenMinutes = new Date().getTime() + 10*60*1000;

  await db.collection("qr_sessions").add({
    classId: "DBMS",
    teacherId: currentUser.uid,
    qrToken: token,
    validFrom: now,
    validTill: firebase.firestore.Timestamp.fromDate(new Date(tenMinutes)),
    active: true
  });
  alert("QR Session generated: " + token);
}
