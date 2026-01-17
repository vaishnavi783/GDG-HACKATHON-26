// =================== FIREBASE CONFIG ===================
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

// =================== LOGIN ===================
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        if(!userDoc.exists) throw 'User not found';
        const userData = userDoc.data();
        if(userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));
        showDashboard();
    } catch(err) {
        errorEl.innerText = 'Login failed: '+err;
        errorEl.style.display = 'block';
    }
}

function logout() {
    auth.signOut();
    localStorage.removeItem('smartAttendUser');
    currentUser = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
}

// =================== DASHBOARD ===================
function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadAttendanceSummary();
}

// =================== ATTENDANCE ===================
async function markAttendance() {
    if(currentUser.role !== 'student') { alert('Only students can mark attendance'); return; }

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const session = now.getHours() < 12 ? 'morning' : 'afternoon';
    const statusEl = document.getElementById('attendance-status');
    const attendanceRef = db.collection('attendance').doc(currentUser.uid).collection('records');

    try {
        const snapshot = await attendanceRef.where('date','==',date).where('session','==',session).get();
        if(!snapshot.empty) { statusEl.innerText = 'Already marked this session'; return; }

        navigator.geolocation.getCurrentPosition(async (pos)=>{
            const geo = new firebase.firestore.GeoPoint(pos.coords.latitude,pos.coords.longitude);
            await attendanceRef.add({
                date, session, status:'present', timestamp: firebase.firestore.FieldValue.serverTimestamp(), location: geo
            });
            statusEl.innerText = '✅ Attendance marked!';
            loadAttendanceSummary();
        }, err => { alert('Geolocation error'); console.error(err); });

    } catch(err) { console.error(err); statusEl.innerText='❌ Failed to mark attendance'; }
}

// =================== ATTENDANCE SUMMARY ===================
async function loadAttendanceSummary() {
    if(currentUser.role !== 'student') return;

    const summaryEl = document.getElementById('attendance-summary');
    const attendanceRef = db.collection('attendance').doc(currentUser.uid).collection('records');
    const snapshot = await attendanceRef.get();

    const totalClasses = snapshot.size;
    const presentCount = snapshot.docs.filter(d=>d.data().status==='present').length;
    const percentage = totalClasses ? ((presentCount/totalClasses)*100).toFixed(1) : 0;

    summaryEl.innerHTML = `
        <p>Total Classes: ${totalClasses}</p>
        <p>Present: ${presentCount}</p>
        <p>Percentage: ${percentage}%</p>
    `;
}
