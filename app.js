// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDehcanIPU9BuOuI7qOFjW7cAFXRSExIB0",
  authDomain: "attendx-6be15.firebaseapp.com",
  projectId: "attendx-6be15",
  storageBucket: "attendx-6be15.appspot.com",
  messagingSenderId: "593387890331",
  appId: "1:593387890331:web:f11e81a9ac30f23dbc083e"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ---------------------- LOGIN ----------------------
async function login(){
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if(!email || !password || !role){
        alert('Enter email, password and role');
        return;
    }

    try{
        const userCred = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        if(!userDoc.exists) throw 'User not found';
        const data = userDoc.data();
        if(data.role !== role) throw 'Role mismatch';
        currentUser = { uid, ...data };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));
        showDashboard();
    }catch(e){
        alert('Login failed: ' + e.message || e);
    }
}

// ---------------------- LOGOUT ----------------------
function logout(){
    auth.signOut();
    localStorage.removeItem('smartAttendUser');
    location.reload();
}

// ---------------------- DASHBOARD ----------------------
function showDashboard(){
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role;

    document.getElementById('welcome-msg').textContent = `Welcome, ${currentUser.name} (${currentUser.role})`;

    displayRandomQuote();
    updateDateTime();
    setInterval(updateDateTime, 1000);

    loadTodaysClasses();
    loadAttendanceSummary();
    loadCorrectionRequests();
    loadAuditLogs();
    loadPredictions();

    if(currentUser.role === 'teacher'){
        document.getElementById('teacher-qr-card').style.display = 'block';
    }
}

// ---------------------- QUOTES & DATETIME ----------------------
const quotes = [
    "Education is the most powerful weapon. - Mandela",
    "The future belongs to those who believe in their dreams. - Roosevelt",
    "Success is not final, failure is not fatal. - Churchill"
];
function displayRandomQuote(){
    const quoteEl = document.getElementById('quoteText');
    quoteEl.textContent = quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>{quoteEl.textContent = quotes[Math.floor(Math.random()*quotes.length)];}, 30000);
}
function updateDateTime(){
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString();
    document.getElementById('time').textContent = now.toLocaleTimeString();
}

// ---------------------- TODAY CLASSES ----------------------
async function loadTodaysClasses(){
    const classesEl = document.getElementById('todays-classes');
    classesEl.innerHTML = '';
    const snapshot = await db.collection('classes').get();
    const today = new Date().getDay(); // 0-6
    snapshot.forEach(doc=>{
        const cls = doc.data();
        classesEl.innerHTML += `<div>${cls.className} | ${cls.startTime}-${cls.endTime}</div>`;
    });
}

// ---------------------- ATTENDANCE ----------------------
async function markAttendance(){
    if(currentUser.role !== 'student'){ alert('Only students can mark'); return; }

    if(!navigator.geolocation){ alert('Geo-location not supported'); return; }
    navigator.geolocation.getCurrentPosition(async pos=>{
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // TODO: fetch today's active QR session & geo-fence
        // verify QR & geo
        // mark attendance in attendance/{classId}/{date}/{studentUid}

        alert('Attendance feature triggered (QR + Geo verification)');
    });
}

async function loadAttendanceSummary(){
    document.getElementById('attendance-summary').innerHTML = '<p>Loading...</p>';
    if(currentUser.role === 'student'){
        const doc = await db.collection('predictions').doc(currentUser.uid).get();
        if(doc.exists){
            const data = doc.data();
            document.getElementById('attendance-summary').innerHTML = `
                <p>Attendance %: ${data.attendancePercentage}</p>
                <p>Risk Level: ${data.riskLevel}</p>
            `;
        }else{
            document.getElementById('attendance-summary').innerHTML = `<p>No attendance yet.</p>`;
        }
    }else{
        document.getElementById('attendance-summary').innerHTML = `<p>Teacher view: Attendance stats</p>`;
    }
}

// ---------------------- CORRECTION REQUESTS ----------------------
async function loadCorrectionRequests(){
    const corrEl = document.getElementById('correction-requests');
    corrEl.innerHTML = 'Loading...';
    const snapshot = await db.collection('corrections')
        .where(currentUser.role==='student'?'studentId':'status','==',currentUser.role==='student'?currentUser.uid:'pending')
        .get();
    snapshot.forEach(doc=>{
        const c = doc.data();
        corrEl.innerHTML += `<div>${c.date} | ${c.reason} | ${c.status}</div>`;
    });
}

// ---------------------- AUDIT LOGS ----------------------
function loadAuditLogs(){
    google.charts.load('current', {packages:['corechart']});
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Action','Count'],
            ['Attendance Marked', 5],
            ['Correction Approved', 2],
            ['Correction Rejected', 1]
        ]);
        const chart = new google.visualization.PieChart(document.getElementById('chart_div'));
        chart.draw(data, {});
    });
}

// ---------------------- PREDICTIONS ----------------------
async function loadPredictions(){
    const predEl = document.getElementById('prediction-data');
    if(currentUser.role==='student'){
        const doc = await db.collection('predictions').doc(currentUser.uid).get();
        if(doc.exists){
            const data = doc.data();
            predEl.innerHTML = `<p>Attendance: ${data.attendancePercentage}%</p><p>Risk: ${data.riskLevel}</p>`;
        }else{
            predEl.innerHTML = `<p>No prediction data.</p>`;
        }
    }else{
        predEl.innerHTML = `<p>Teacher cannot see predictions.</p>`;
    }
}

// ---------------------- TEACHER QR ----------------------
async function generateQRCode(){
    if(currentUser.role!=='teacher'){ alert('Only teachers'); return; }
    const token = Math.random().toString(36).substring(2,8).toUpperCase();
    const now = firebase.firestore.Timestamp.now();
    const later = firebase.firestore.Timestamp.fromDate(new Date(Date.now()+10*60*1000));
    await db.collection('qr_sessions').add({
        classId: 'classIdHere', // TODO select class
        teacherId: currentUser.uid,
        qrToken: token,
        validFrom: now,
        validTill: later,
        active:true
    });
    alert('QR Generated: '+token);
}
