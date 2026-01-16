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
    "Be
