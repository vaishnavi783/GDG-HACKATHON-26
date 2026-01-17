let currentUser = null;

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', function() {
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

    if (!email || !password) { showError('Please enter email & password'); return; }

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
        showDashboard();

    } catch (error) {
        showError('Login failed: ' + (error.message || error));
    } finally {
        spinner.style.display = 'none';
        loginBtn.disabled = false;
    }
}

function showError(message) {
    const errorElement = document.getElementById('login-error');
    errorElement.innerText = message;
    errorElement.style.display = 'block';
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
    document.getElementById('user-role').textContent = currentUser.role;

    document.querySelector('header').innerHTML = `🌸 Smart Attendance & Wellness Portal | Welcome, ${currentUser.name} <button onclick="logout()" class="logout-btn">Logout</button>`;

    initializeCharts();
    loadAttendanceData();
    loadTodaysClasses();

    if (currentUser.role === 'teacher') {
        document.getElementById('teacher-projects-card').style.display = 'block';
        document.getElementById('student-project-card').style.display = 'none';
        loadProjectSubmissions();
    } else {
        document.getElementById('teacher-projects-card').style.display = 'none';
        document.getElementById('student-project-card').style.display = 'block';
    }
}

// ===================== ATTENDANCE =====================
async function markAttendance() {
    if (currentUser.role !== 'student') { alert('Only students can mark attendance'); return; }

    const statusElement = document.getElementById('status');
    statusElement.innerText = '📷 Scanning QR...';

    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection('attendance').doc(currentUser.uid);

    try {
        await db.runTransaction(async transaction => {
            const doc = await transaction.get(docRef);
            let data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0, history: [] };

            // Allow max 2 attendance per day
            const todayCount = data.history.filter(h => h.date === today).length;
            if (todayCount >= 2) throw 'Attendance already marked twice today';

            data.totalClasses += 1;
            data.presentCount += 1;
            data.history.unshift({ date: today, status: 'Present', location: new firebase.firestore.GeoPoint(0,0) });

            transaction.set(docRef, data);
        });

        statusElement.innerText = '✅ Attendance marked!';
        loadAttendanceData();
    } catch (error) {
        statusElement.innerText = '❌ ' + error;
    }
}

async function loadAttendanceData() {
    const summary = document.getElementById('attendance-summary');
    if (currentUser.role === 'student') {
        const doc = await db.collection('attendance').doc(currentUser.uid).get();
        const data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0 };
        const percentage = data.totalClasses ? ((data.presentCount / data.totalClasses) * 100).toFixed(1) : 0;
        summary.innerHTML = `<p>Total Classes: ${data.totalClasses}</p>
                             <p>Present: ${data.presentCount}</p>
                             <p>Percentage: ${percentage}%</p>`;
    } else {
        summary.innerHTML = `<p>Teacher dashboard: View student attendance records</p>`;
    }
}

// ===================== PROJECT SUBMISSIONS =====================
async function submitProjectWork() {
    const title = prompt('Enter Project Title:');
    if (!title) return;

    try {
        await db.collection('projectSubmissions').add({
            studentName: currentUser.name,
            studentEmail: currentUser.email,
            title,
            submittedAt: new Date(),
            status: 'Pending'
        });
        alert('Project submitted successfully!');
    } catch (error) {
        console.error(error);
        alert('Failed to submit project');
    }
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

async function updateProjectStatus(id,status) {
    await db.collection('projectSubmissions').doc(id).update({status});
    loadProjectSubmissions();
}

// ===================== CORRECTION REQUEST =====================
async function requestCorrection() {
    const reason = prompt('Enter reason for correction:');
    if (!reason) return;
    await db.collection('correctionRequests').add({
        studentName: currentUser.name,
        studentEmail: currentUser.email,
        reason,
        status: 'Pending',
        submittedAt: new Date()
    });
    document.getElementById('correctionStatus').innerText = 'Request sent';
}

// ===================== TODAY'S CLASSES =====================
async function loadTodaysClasses() {
    const today = new Date().getDay();
    const classesElement = document.getElementById('todays-classes');
    const snapshot = await db.collection('todayClasses').doc(currentUser.uid).collection('classes').get();
    if (snapshot.empty) classesElement.innerHTML = '<p>No classes today</p>';
    else {
        classesElement.innerHTML = snapshot.docs.map(doc => `<div>${doc.data().subject} (${doc.data().time})</div>`).join('');
    }
}

// ===================== MOTIVATION =====================
const quotes = [
    "Education is the most powerful weapon. - Nelson Mandela",
    "Believe you can and you're halfway there. - Theodore Roosevelt",
    "Don't watch the clock; do what it does. Keep going. - Sam Levenson"
];
function displayRandomQuote() {
    const quoteElement = document.getElementById('quoteText');
    quoteElement.innerText = quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>quoteElement.innerText = quotes[Math.floor(Math.random()*quotes.length)],30000);
}

// ===================== DATE/TIME =====================
function updateDateTime() {
    const now = new Date();
    document.getElementById('date').innerText = now.toLocaleDateString();
    document.getElementById('time').innerText = now.toLocaleTimeString();
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
    google.charts.load('current', { packages:['corechart'] });
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Day','Attendance %',{role:'style'}],
            ['Mon',85,'#667eea'],['Tue',92,'#667eea'],['Wed',78,'#667eea'],
            ['Thu',95,'#667eea'],['Fri',88,'#667eea'],['Sat',65,'#764ba2'],['Sun',0,'#764ba2']
        ]);
        const options = { title:'Weekly Attendance', curveType:'function', legend:{position:'bottom'}, backgroundColor:'transparent', vAxis:{viewWindow:{min:0,max:100}} };
        const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,options);
    });
}
