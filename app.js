// ================= Firebase Config =================
const firebaseConfig = {
  apiKey: "AIzaSyDehcanIPU9BuOuI7qOFjW7cAFXRSExIB0",
  authDomain: "attendx-6be15.firebaseapp.com",
  projectId: "attendx-6be15",
  storageBucket: "attendx-6be15.firebasestorage.app",
  messagingSenderId: "593387890331",
  appId: "1:593387890331:web:f11e81a9ac30f23dbc083e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ================= LOGIN =================
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const errorEl = document.getElementById('login-error');

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) throw 'User not found';

        const userData = userDoc.data();
        if(userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        showDashboard();
    } catch (err) {
        errorEl.style.display = 'block';
        errorEl.innerText = 'Login failed: ' + err;
    }
}

// ================= LOGOUT =================
function logout() {
    auth.signOut();
    currentUser = null;
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

// ================= SHOW DASHBOARD =================
function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    document.getElementById('user-name').innerText = currentUser.name;
    document.getElementById('user-email').innerText = currentUser.email;
    document.getElementById('user-role-header').innerText = currentUser.role.toUpperCase();

    if(currentUser.role === 'student') {
        document.getElementById('student-attendance').style.display = 'block';
    }
}

// ================= MARK ATTENDANCE =================
async function markAttendance() {
    const statusEl = document.getElementById('attendance-status');
    if(currentUser.role !== 'student') {
        statusEl.innerText = "Only students can mark attendance";
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const session = "morning"; // or "afternoon" based on your logic

    try {
        const attendanceRef = db.collection('attendance').doc(currentUser.uid).collection('records');

        // Check if already marked today for this session
        const snapshot = await attendanceRef
            .where('date','==',today)
            .where('session','==',session)
            .get();

        if(!snapshot.empty) {
            statusEl.innerText = "Attendance already marked for " + session;
            return;
        }

        await attendanceRef.add({
            date: today,
            session: session,
            status: "present",
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            location: new firebase.firestore.GeoPoint(12.9716,77.5946) // Example coordinates
        });

        statusEl.innerText = "Attendance marked successfully!";
    } catch(err) {
        console.error(err);
        statusEl.innerText = "Error marking attendance: " + err;
    }
}
