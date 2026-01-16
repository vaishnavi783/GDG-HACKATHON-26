// ===================== FIREBASE REFS =====================
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();

    // Check if user is logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            loadUserData(user.uid);
        } else {
            showLogin();
        }
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

    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }

    spinner.style.display = 'block';
    loginBtn.disabled = true;
    errorElement.style.display = 'none';

    try {
        // Firebase Auth login
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Get user data from Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw 'User data not found';

        const userData = userDoc.data();
        if (userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

        loginBtn.innerHTML = '✓ Login Successful!';
        loginBtn.style.backgroundColor = '#2ecc71';

        setTimeout(showDashboard, 1000);
    } catch (error) {
        showError('Login failed: ' + error.message || error);
    } finally {
        spinner.style.display = 'none';
        loginBtn.disabled = false;
    }
}

function showError(message) {
    const errorElement = document.getElementById('login-error');
    errorElement.innerHTML = message;
    errorElement.style.display = 'block';
}

// ===================== LOGOUT =====================
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut();
        localStorage.removeItem('smartAttendUser');
        currentUser = null;
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

// ===================== DASHBOARD =====================
function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

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

// ===================== MOTIVATION & DATE =====================
const quotes = [
    "Education is the most powerful weapon which you can use to change the world. - Nelson Mandela",
    "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
    "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
    "The only way to do great work is to love what you do. - Steve Jobs",
    "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
    "Believe you can and you're halfway there. - Theodore Roosevelt",
    "The secret of getting ahead is getting started. - Mark Twain"
];

function displayRandomQuote() {
    const quoteElement = document.getElementById('quoteText');
    quoteElement.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    setInterval(() => {
        quoteElement.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    }, 30000);
}

function updateDateTime() {
    const now = new Date();
    const dateElement = document.getElementById('date');
    const timeElement = document.getElementById('time');

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = now.toLocaleDateString('en-US', options);
    timeElement.textContent = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
}

// ===================== ATTENDANCE =====================
async function markAttendance() {
    if (currentUser.role !== 'student') { alert('Only students can mark attendance.'); return; }

    const statusElement = document.getElementById('status');
    statusElement.innerHTML = '📷 Scanning QR...';

    try {
        const today = new Date().toISOString().split('T')[0];
        const attendanceRef = db.collection('attendance').doc(currentUser.uid);

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(attendanceRef);
            let data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0, history: [] };

            data.totalClasses += 1;
            data.presentCount += 1;
            data.history.unshift({ date: today, status: 'Present' });

            transaction.set(attendanceRef, data);
        });

        statusElement.innerHTML = '✅ Attendance marked!';
        loadAttendanceData();
    } catch (error) {
        statusElement.innerHTML = '❌ Failed to mark attendance';
        console.error(error);
    }
}

async function loadAttendanceData() {
    const summaryElement = document.getElementById('attendance-summary');
    if (currentUser.role === 'student') {
        try {
            const doc = await db.collection('attendance').doc(currentUser.uid).get();
            const data = doc.exists ? doc.data() : { totalClasses: 0, presentCount: 0 };
            const percentage = data.totalClasses ? (data.presentCount / data.totalClasses * 100).toFixed(1) : 0;

            summaryElement.innerHTML = `
                <p>Total Classes: ${data.totalClasses}</p>
                <p>Present: ${data.presentCount}</p>
                <p>Percentage: ${percentage}%</p>
            `;
        } catch (error) {
            console.error(error);
        }
    } else {
        summaryElement.innerHTML = `<p>Teacher dashboard: View student attendance records</p>`;
    }
}

// ===================== PROJECT WORK =====================
async function submitProjectWork() {
    const projectName = prompt('Enter Project Title:');
    if (!projectName) return;

    try {
        const submission = {
            studentEmail: currentUser.email,
            studentName: currentUser.name,
            title: projectName,
            submittedAt: new Date().toISOString(),
            status: 'Pending'
        };
        await db.collection('projectSubmissions').add(submission);
        showNotification('Project submitted successfully!', 'success');
    } catch (error) {
        showNotification('Failed to submit project', 'error');
        console.error(error);
    }
}

async function loadProjectSubmissions() {
    const container = document.getElementById('project-submissions');
    container.innerHTML = '';

    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach((doc, index) => {
        const proj = doc.data();
        const div = document.createElement('div');
        div.className = 'project-item';
        div.innerHTML = `
            <span>${proj.studentName}: ${proj.title} - ${proj.status}</span>
            <button onclick="updateProjectStatus('${doc.id}', 'Approved')">Approve</button>
            <button onclick="updateProjectStatus('${doc.id}', 'Rejected')">Reject</button>
        `;
        container.appendChild(div);
    });
}

async function updateProjectStatus(docId, status) {
    await db.collection('projectSubmissions').doc(docId).update({ status });
    loadProjectSubmissions();
    showNotification(`Project ${status}`, status === 'Approved' ? 'success' : 'error');
}

// ===================== CHARTS & CLASSES =====================
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

function loadTodaysClasses() {
    const demoClasses = {
        1: ['Mathematics (9:00 AM)', 'Physics (11:00 AM)', 'CS (2:00 PM)'],
        2: ['Chemistry (10:00 AM)', 'Biology (1:00 PM)', 'English (3:00 PM)'],
        3: ['Math (9:00 AM)', 'Physics Lab (11:00 AM)', 'Programming (2:00 PM)'],
        4: ['DS (10:00 AM)', 'Chemistry Lab (2:00 PM)'],
        5: ['Project Work (9:00 AM)', 'Seminar (3:00 PM)'],
        6: ['No Regular Classes'],
        0: ['Weekend - No Classes']
    };
    const today = new Date().getDay();
    const classesElement = document.getElementById('todays-classes');
    classesElement.innerHTML = demoClasses[today].map(cls => `<div>${cls}</div>`).join('');
}

// ===================== NOTIFICATIONS =====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(notification);
    setTimeout(() => { if(notification.parentElement) notification.remove(); }, 5000);
}

// ===================== LOAD USER DATA =====================
async function loadUserData(uid) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return showLogin();

    currentUser = { uid, ...userDoc.data() };
    localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));
    showDashboard();
}
