// ================== GLOBAL ==================
let currentUser = null;

// ================== UTILS ==================
function formatTime(date) {
  return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getRandomQuote() {
  const quotes = [
    "Knowledge is power.",
    "Success is the sum of small efforts.",
    "Consistency is key.",
    "Learning never exhausts the mind.",
    "Stay curious, stay smart."
  ];
  return quotes[Math.floor(Math.random()*quotes.length)];
}

// ================== LOGIN ==================
async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const roleSelected = document.getElementById('role').value.toLowerCase();
  const errorElement = document.getElementById('login-error');
  errorElement.style.display = 'none';

  if (!email || !password) {
    errorElement.innerText = "Enter email & password";
    errorElement.style.display = 'block';
    return;
  }

  try {
    // Sign in with Firebase Auth
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // Get user from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User not found in Firestore");

    const userData = userDoc.data();
    const userRole = (userData.role || "").toLowerCase();
    if (userRole !== roleSelected) throw new Error(`Role mismatch!`);

    currentUser = { uid, ...userData };
    localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

    showDashboard();
  } catch (err) {
    console.error(err);
    errorElement.innerText = "Login failed: " + (err.message || err);
    errorElement.style.display = 'block';
  }
}

// ================== LOGOUT ==================
function logout() {
  auth.signOut();
  localStorage.removeItem('smartAttendUser');
  currentUser = null;
  document.getElementById('login-page').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
}

// ================== DASHBOARD ==================
function showDashboard() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  // Date & Time
  const now = new Date();
  document.getElementById('date').innerText = now.toDateString();
  document.getElementById('time').innerText = formatTime(now);

  // User Info
  document.getElementById('user-email').innerText = currentUser.email;
  document.getElementById('user-role').innerText = currentUser.role;

  // Quote
  document.getElementById('quoteText').innerText = getRandomQuote();

  loadTodaysClasses();
  loadAttendanceSummary();
  loadAuditLogs();
}

// ================== TODAY'S CLASSES ==================
async function loadTodaysClasses() {
  const today = formatDate(new Date());
  const container = document.getElementById('todays-classes');
  container.innerHTML = '';

  if (currentUser.role === 'student') {
    const snapshot = await db.collection('classes')
      .where('department','==',currentUser.department)
      .where('year','==',currentUser.year).get();

    if (snapshot.empty) container.innerHTML = '<p>No classes today</p>';
    snapshot.docs.forEach(doc=>{
      const c = doc.data();
      container.innerHTML += `<p>${c.className} (${c.startTime}-${c.endTime})</p>`;
    });

  } else if (currentUser.role === 'teacher') {
    const snapshot = await db.collection('classes')
      .where('teacherId','==',currentUser.uid).get();

    if (snapshot.empty) container.innerHTML = '<p>No classes today</p>';
    snapshot.docs.forEach(doc=>{
      const c = doc.data();
      container.innerHTML += `<p>${c.className} (${c.startTime}-${c.endTime})</p>`;
    });
  }
}

// ================== ATTENDANCE ==================
async function markAttendance() {
  if (currentUser.role !== 'student') {
    alert("Only students can mark attendance!");
    return;
  }

  const today = formatDate(new Date());

  const qrSnapshot = await db.collection('qr_sessions')
    .where('active','==',true)
    .get();

  if (qrSnapshot.empty) {
    document.getElementById('attendance-status').innerText = 'No active QR session today';
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    const geoDoc = await db.collection('geo_fences').doc('college').get();
    const geo = geoDoc.data();
    const distance = Math.sqrt(Math.pow(lat-geo.latitude,2)+Math.pow(lng-geo.longitude,2))*111000;

    if (distance > geo.radius) {
      document.getElementById('attendance-status').innerText = 'Out of geo-fence';
      return;
    }

    const qrDoc = qrSnapshot.docs[0];
    const sessionId = qrDoc.id;
    const classId = qrDoc.data().classId;

    await db.collection('attendance').doc(classId)
      .collection(today).doc(currentUser.uid).set({
        status: 'present',
        markedAt: firebase.firestore.FieldValue.serverTimestamp(),
        locationVerified: true,
        qrVerified: true,
        approved: false
      });

    await db.collection('audit_logs').add({
      userId: currentUser.uid,
      role: 'student',
      action: 'ATTENDANCE_MARKED',
      details: 'QR + Geo verified',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('attendance-status').innerText = 'Attendance marked successfully!';
  }, err=>{
    console.error(err);
    document.getElementById('attendance-status').innerText = 'Location access denied';
  });
}

// ================== ATTENDANCE SUMMARY ==================
async function loadAttendanceSummary() {
  if (currentUser.role !== 'student') return;

  const totalElem = document.getElementById('total-classes');
  const presentElem = document.getElementById('present-count');
  const percElem = document.getElementById('attendance-percentage');

  const snapshot = await db.collectionGroup('attendance')
    .get();

  let total=0, present=0;
  snapshot.docs.forEach(d=>{
    const data = d.data();
    if(d.id === currentUser.uid){
      total++;
      if(data.status==='present') present++;
    }
  });

  const perc = total===0?0:Math.round((present/total)*100);
  totalElem.innerText = total;
  presentElem.innerText = present;
  percElem.innerText = perc + '%';
}

// ================== AUDIT LOGS ==================
async function loadAuditLogs() {
  const container = document.getElementById('audit-logs');
  container.innerHTML = '';

  const snapshot = await db.collection('audit_logs')
    .where('userId','==',currentUser.uid)
    .orderBy('timestamp','desc')
    .limit(10)
    .get();

  if (snapshot.empty) container.innerHTML = '<p>No logs yet</p>';
  snapshot.docs.forEach(doc=>{
    const d = doc.data();
    container.innerHTML += `<p>${d.action} - ${new Date(d.timestamp?.toMillis()).toLocaleString()}</p>`;
  });
}

// ================== CORRECTION REQUEST ==================
async function requestCorrection() {
  if (currentUser.role !== 'student') return;

  const classId = prompt('Enter Class ID for correction:');
  const date = prompt('Enter Date (YYYY-MM-DD):');
  const reason = prompt('Enter reason:');

  await db.collection('corrections').add({
    studentId: currentUser.uid,
    classId,
    date,
    reason,
    status: 'pending',
    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: ''
  });

  document.getElementById('correction-status').innerText = 'Request submitted!';
}

// ================== PREDICTION ==================
async function getPrediction() {
  if (currentUser.role !== 'student') return;

  const doc = await db.collection('predictions').doc(currentUser.uid).get();
  if (!doc.exists) {
    document.getElementById('prediction-status').innerText = 'No prediction available';
    return;
  }

  const data = doc.data();
  document.getElementById('prediction-status').innerText =
    `Attendance: ${data.attendancePercentage}% | Risk: ${data.riskLevel}`;
}

// ================== SESSION CHECK ==================
auth.onAuthStateChanged(user=>{
  if (user) {
    db.collection('users').doc(user.uid).get().then(doc=>{
      if(doc.exists){
        currentUser = {uid: user.uid, ...doc.data()};
        showDashboard();
      } else logout();
    });
  } else {
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }
});
