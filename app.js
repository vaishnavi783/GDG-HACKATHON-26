const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

/* ---------------- INIT ---------------- */
auth.onAuthStateChanged(async user => {
  if (user) loadUserData(user.uid);
  else showLogin();
});

/* ---------------- LOGIN ---------------- */
async function login() {
  const email = emailInput();
  const password = passwordInput();
  const role = document.getElementById("role").value;

  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    const uid = res.user.uid;

    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) throw "User record missing";

    if (snap.data().role !== role) throw "Role mismatch";

    currentUser = { uid, ...snap.data() };
    showDashboard();
  } catch (e) {
    showError(e);
  }
}

/* ---------------- LOGOUT ---------------- */
function logout() {
  auth.signOut();
  currentUser = null;
  showLogin();
}

/* ---------------- UI ---------------- */
function showLogin() {
  document.getElementById("login-page").style.display = "block";
  document.getElementById("dashboard").style.display = "none";
}

function showDashboard() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("dashboard").style.display = "block";

  document.getElementById("user-email").innerText = currentUser.email;
  document.getElementById("user-role").innerText = currentUser.role;

  displayQuote();
  loadAttendance();

  if (currentUser.role === "teacher") {
    document.getElementById("teacher-projects-card").style.display = "block";
    loadProjectSubmissions();
  }
}

/* ---------------- ATTENDANCE ---------------- */
async function markAttendance() {
  const today = new Date().toISOString().split("T")[0];
  const ref = db.collection("attendance").doc(currentUser.uid);
  const snap = await ref.get();

  let data = snap.exists ? snap.data() : { total: 0, present: 0, history: [] };

  if (data.history[0]?.date === today) {
    alert("Already marked today");
    return;
  }

  data.total++;
  data.present++;
  data.history.unshift({ date: today });

  await ref.set(data);
  loadAttendance();
}

async function loadAttendance() {
  const ref = db.collection("attendance").doc(currentUser.uid);
  const snap = await ref.get();
  if (!snap.exists) return;

  const d = snap.data();
  const pct = ((d.present / d.total) * 100).toFixed(1);

  document.getElementById("attendance-summary").innerHTML =
    `Total: ${d.total} | Present: ${d.present} | ${pct}%`;
}

/* ---------------- CORRECTION ---------------- */
async function requestCorrection() {
  const reason = prompt("Enter reason");
  if (!reason) return;

  await db.collection("correctionRequests").add({
    student: currentUser.email,
    reason,
    status: "Pending",
    time: new Date()
  });

  alert("Request sent");
}

/* ---------------- PROJECT ---------------- */
async function submitProjectWork() {
  const title = prompt("Project title");
  if (!title) return;

  await db.collection("projectSubmissions").add({
    title,
    student: currentUser.email,
    status: "Pending",
    time: new Date()
  });

  alert("Submitted");
}

async function loadProjectSubmissions() {
  const box = document.getElementById("project-submissions");
  box.innerHTML = "";

  const snap = await db.collection("projectSubmissions").get();
  snap.forEach(doc => {
    const d = doc.data();
    box.innerHTML += `
      <div>
        ${d.student} - ${d.title} (${d.status})
        <button onclick="updateProject('${doc.id}','Approved')">✔</button>
        <button onclick="updateProject('${doc.id}','Rejected')">✖</button>
      </div>`;
  });
}

async function updateProject(id, status) {
  await db.collection("projectSubmissions").doc(id).update({ status });
  loadProjectSubmissions();
}

/* ---------------- UTIL ---------------- */
function displayQuote() {
  const q = [
    "Success is not final",
    "Believe in yourself",
    "Work smart"
  ];
  document.getElementById("quoteText").innerText =
    q[Math.floor(Math.random() * q.length)];
}

function loadUserData(uid) {
  db.collection("users").doc(uid).get().then(doc => {
    if (!doc.exists) return logout();
    currentUser = { uid, ...doc.data() };
    showDashboard();
  });
}

function showError(e) {
  document.getElementById("login-error").innerText =
    e.message || e;
}

function emailInput() {
  return document.getElementById("email").value.trim();
}
function passwordInput() {
  return document.getElementById("password").value;
}
