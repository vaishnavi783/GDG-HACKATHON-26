let currentUser = null;

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', () => {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();

    auth.onAuthStateChanged(user => {
        if (user) loadUserData(user.uid);
        else showLogin();
    });
});

// ===================== LOGIN =====================
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    const errorElement = document.getElementById('login-error');

    if (!email || !password) return showError('Enter email and password');

    spinner.style.display = 'block';
    loginBtn.disabled = true;
    errorElement.style.display = 'none';

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw 'User not found';
        const userData = userDoc.data();
        if (userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

        loginBtn.innerHTML = '✓ Login Successful!';
        loginBtn.style.background = '#2ecc71';
        setTimeout(showDashboard, 1000);
    } catch (err) {
        showError(err.message || err);
    } finally {
        spinner.style.display = 'none';
        loginBtn.disabled = false;
    }
}

function showError(msg) {
    const e = document.getElementById('login-error');
    e.innerHTML = msg;
    e.style.display = 'block';
}

// ===================== LOGOUT =====================
function logout() {
    auth.signOut();
    localStorage.removeItem('smartAttendUser');
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
}

// ===================== DASHBOARD =====================
function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = capitalize(currentUser.role);

    document.querySelector('header').innerHTML = `🌸 Smart Attendance & Wellness Portal | Welcome, ${currentUser.name} <button onclick="logout()" class="logout-btn">Logout</button>`;

    initializeCharts();
    loadAttendanceData();
    loadTodaysClasses();

    if (currentUser.role === 'teacher') {
        document.getElementById('teacher-projects-card').style.display = 'block';
        loadProjectSubmissions();
    } else {
        document.getElementById('student-project-card').style.display = 'block';
    }
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

// ===================== DATE & QUOTE =====================
const quotes = [
  "Education is the most powerful weapon which you can use to change the world. - Nelson Mandela",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill"
];

function displayRandomQuote() {
    const q = document.getElementById('quoteText');
    q.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    setInterval(() => { q.textContent = quotes[Math.floor(Math.random() * quotes.length)]; }, 30000);
}

function updateDateTime() {
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString();
    document.getElementById('time').textContent = now.toLocaleTimeString();
}

// ===================== ATTENDANCE =====================
async function markAttendance() {
    if (currentUser.role !== 'student') return alert('Only students can mark attendance');

    const statusEl = document.getElementById('status');
    statusEl.innerHTML = '📷 Scanning QR...';

    try {
        // Example: simulate QR + geolocation
        const pos = await getLocation();
        const today = new Date().toISOString().split('T')[0];

        const attRef = db.collection('attendance').doc(currentUser.uid);
        await db.runTransaction(async t => {
            const doc = await t.get(attRef);
            let data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0, history: [] };
            data.totalClasses += 1;
            data.presentCount += 1;
            data.history.unshift({ date: firebase.firestore.FieldValue.serverTimestamp(), status: 'Present', location: new firebase.firestore.GeoPoint(pos.lat, pos.lng) });
            t.set(attRef, data);
        });

        statusEl.innerHTML = '✅ Attendance marked!';
        loadAttendanceData();
    } catch (err) { statusEl.innerHTML = '❌ Failed to mark attendance'; console.error(err); }
}

function getLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(pos => {
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }, err => reject(err));
    });
}

// ===================== LOAD ATTENDANCE =====================
async function loadAttendanceData() {
    const summary = document.getElementById('attendance-summary');
    if (currentUser.role === 'student') {
        const doc = await db.collection('attendance').doc(currentUser.uid).get();
        const data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0 };
        const pct = data.totalClasses ? ((data.presentCount / data.totalClasses) * 100).toFixed(1) : 0;
        summary.innerHTML = `<p>Total Classes: ${data.totalClasses}</p><p>Present: ${data.presentCount}</p><p>Percentage: ${pct}%</p>`;
    } else {
        summary.innerHTML = `<p>Teacher dashboard: view student attendance records</p>`;
    }
}

// ===================== PROJECT WORK =====================
async function submitProjectWork() {
    const title = prompt('Enter Project Title:');
    if (!title) return;
    await db.collection('projectSubmissions').add({
        studentUID: currentUser.uid,
        studentName: currentUser.name,
        studentEmail: currentUser.email,
        title,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'Pending'
    });
    alert('Project submitted successfully!');
}

async function loadProjectSubmissions() {
    const container = document.getElementById('project-submissions');
    container.innerHTML = '';
    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach(doc => {
        const proj = doc.data();
        const div = document.createElement('div');
        div.className = 'project-item';
        div.innerHTML = `<span>${proj.studentName}: ${proj.title} - ${proj.status}</span>
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(id, status) {
    await db.collection('projectSubmissions').doc(id).update({ status });
    loadProjectSubmissions();
}

// ===================== TODAY CLASSES =====================
async function loadTodaysClasses() {
    const today = new Date().getDay();
    const classesEl = document.getElementById('todays-classes');
    const snapshot = await db.collection('todayClasses').doc(currentUser.uid).collection('classes').get();
    const todayClasses = snapshot.docs.map(d => d.data());
    classesEl.innerHTML = todayClasses.length ? todayClasses.map(c => `<div>${c.subject} (${c.time}) - ${c.teacher}</div>`).join('') : '<p>No classes scheduled for today</p>';
}

// ===================== LOAD USER =====================
async function loadUserData(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return showLogin();
    currentUser = { uid, ...doc.data() };
    showDashboard();
}

// ===================== CHARTS =====================
function initializeCharts() {
    google.charts.load('current', { packages: ['corechart'] });
    google.charts.setOnLoadCallback(() => {
        const data = google.visualization.arrayToDataTable([
            ['Day', 'Attendance %', { role: 'style' }],
            ['Mon', 85, '#667eea'],
            ['Tue', 92, '#667eea'],
            ['Wed', 78, '#667eea'],
            ['Thu', 95, '#667eea'],
            ['Fri', 88, '#667eea'],
            ['Sat', 65, '#764ba2'],
            ['Sun', 0, '#764ba2']
        ]);
        const options = { title: 'Weekly Attendance Trend', curveType: 'function', legend: { position: 'bottom' }, backgroundColor: 'transparent', hAxis: { title: 'Days' }, vAxis: { viewWindow: { min:0, max:100 } } };
        const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data, options);
        window.addEventListener('resize', () => chart.draw(data, options));
    });
}
