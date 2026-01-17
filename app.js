const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();

    auth.onAuthStateChanged(user => {
        if(user) loadUserData(user.uid);
        else showLogin();
    });
});

// ----------------- LOGIN -----------------
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    const errorElement = document.getElementById('login-error');

    if(!email || !password) { showError('Enter email & password'); return; }

    spinner.style.display='block';
    loginBtn.disabled=true;
    errorElement.style.display='none';

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email,password);
        const uid = userCredential.user.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        if(!userDoc.exists) throw 'User data not found';
        const userData = userDoc.data();
        if(userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

        loginBtn.innerHTML='✓ Login Successful!';
        loginBtn.style.backgroundColor='#2ecc71';

        setTimeout(showDashboard, 1000);
    } catch(err) {
        showError('Login failed: ' + (err.message || err));
    } finally {
        spinner.style.display='none';
        loginBtn.disabled=false;
    }
}

function showError(msg) {
    const el = document.getElementById('login-error');
    el.innerHTML = msg;
    el.style.display='block';
}

// ----------------- LOGOUT -----------------
function logout() {
    if(confirm('Logout?')){
        auth.signOut();
        localStorage.removeItem('smartAttendUser');
        currentUser=null;
        showLogin();
    }
}

function showLogin(){
    document.getElementById('login-page').style.display='block';
    document.getElementById('dashboard').style.display='none';
}

// ----------------- DASHBOARD -----------------
function showDashboard(){
    document.getElementById('login-page').style.display='none';
    document.getElementById('dashboard').style.display='block';

    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role;

    document.querySelector('header').innerHTML = `🌸 Smart Attendance & Wellness Portal | Welcome, ${currentUser.name} <button onclick="logout()" class="logout-btn">Logout</button>`;

    initializeCharts();
    loadAttendanceData();
    loadTodaysClasses();

    if(currentUser.role==='teacher'){
        document.getElementById('teacher-projects-card').style.display='block';
        loadProjectSubmissions();
    } else {
        document.getElementById('student-project-card').style.display='block';
    }
}

// ----------------- MOTIVATION -----------------
const quotes = [
    "Education is the most powerful weapon. - Nelson Mandela",
    "The future belongs to those who believe. - Eleanor Roosevelt",
    "Success is not final, failure is not fatal. - Winston Churchill",
    "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
];

function displayRandomQuote() {
    const el = document.getElementById('quoteText');
    el.textContent = quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>el.textContent=quotes[Math.floor(Math.random()*quotes.length)],30000);
}

function updateDateTime(){
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString();
    document.getElementById('time').textContent = now.toLocaleTimeString();
}

// ----------------- ATTENDANCE -----------------
async function markAttendance(){
    if(currentUser.role!=='student'){ alert('Only students can mark attendance'); return; }

    const statusEl = document.getElementById('status');
    statusEl.innerHTML='📷 Scanning QR...';

    try{
        const today = new Date().toISOString().split('T')[0];
        const session = (new Date().getHours()<12) ? 'morning' : 'afternoon';
        const docRef = db.collection('attendance').doc(currentUser.uid).collection('records');

        await docRef.add({
            date: today,
            session: session,
            status:'present',
            timestamp:firebase.firestore.Timestamp.now(),
            location: new firebase.firestore.GeoPoint(0,0)
        });

        statusEl.innerHTML='✅ Attendance marked!';
        loadAttendanceData();
    }catch(err){
        statusEl.innerHTML='❌ Failed';
        console.error(err);
    }
}

async function loadAttendanceData(){
    const summaryEl = document.getElementById('attendance-summary');
    const snapshot = await db.collection('attendance').doc(currentUser.uid).collection('records').get();
    const total = snapshot.size;
    const present = snapshot.docs.filter(d=>d.data().status==='present').length;
    const percent = total?((present/total)*100).toFixed(1):0;
    summaryEl.innerHTML=`<p>Total Classes: ${total}</p><p>Present: ${present}</p><p>Percentage: ${percent}%</p>`;
}

// ----------------- PROJECT WORK -----------------
async function submitProjectWork(){
    const title = prompt('Enter project title:');
    if(!title) return;

    try{
        await db.collection('projectSubmissions').add({
            studentEmail: currentUser.email,
            studentName: currentUser.name,
            title:title,
            submittedAt: new Date().toISOString(),
            status:'Pending'
        });
        alert('Project submitted!');
    }catch(err){ console.error(err); alert('Failed'); }
}

async function loadProjectSubmissions(){
    const container = document.getElementById('project-submissions');
    container.innerHTML='';
    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach(doc=>{
        const data = doc.data();
        const div = document.createElement('div');
        div.innerHTML=`${data.studentName}: ${data.title} - ${data.status} <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button> <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(id,status){
    await db.collection('projectSubmissions').doc(id).update({status});
    loadProjectSubmissions();
}

// ----------------- TODAY'S CLASSES -----------------
function loadTodaysClasses(){
    // For demo
    const classes = ['Math (9AM)','Physics (11AM)','CS (2PM)'];
    document.getElementById('todays-classes').innerHTML=classes.map(c=>`<div>${c}</div>`).join('');
}

// ----------------- CHARTS -----------------
function initializeCharts(){
    google.charts.load('current',{packages:['corechart']});
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Day','Attendance %',{role:'style'}],
            ['Mon',80,'#667eea'],
            ['Tue',90,'#667eea'],
            ['Wed',70,'#667eea'],
            ['Thu',95,'#667eea'],
            ['Fri',85,'#667eea']
        ]);
        const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,{backgroundColor:'transparent',legend:{position:'bottom'}});
    });
}

// ----------------- USER DATA -----------------
async function loadUserData(uid){
    const doc = await db.collection('users').doc(uid).get();
    if(!doc.exists) return showLogin();
    currentUser={uid,...doc.data()};
    localStorage.setItem('smartAttendUser',JSON.stringify(currentUser));
    showDashboard();
}
