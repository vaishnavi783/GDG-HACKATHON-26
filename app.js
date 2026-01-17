let currentUser = null;
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

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();

    auth.onAuthStateChanged(user => {
        if(user){
            db.collection('users').doc(user.uid).get().then(doc => {
                if(!doc.exists){ showLogin(); return; }
                currentUser = { uid: user.uid, ...doc.data() };
                showDashboard();
            });
        } else showLogin();
    });
});

function showError(msg){ 
    const err = document.getElementById('login-error'); 
    err.style.display='block'; 
    err.textContent=msg;
}

// ===================== LOGIN =====================
async function login(){
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if(!email || !password){ showError("Enter email & password"); return; }

    try{
        const userCred = await auth.signInWithEmailAndPassword(email,password);
        const doc = await db.collection('users').doc(userCred.user.uid).get();
        if(!doc.exists) throw "User not found!";
        const data = doc.data();
        if(data.role !== role) throw "Role mismatch!";
        currentUser = { uid: userCred.user.uid, ...data };
        showDashboard();
    }catch(e){ showError("Login failed: "+e.message||e);}
}

function logout(){
    auth.signOut();
    currentUser = null;
    showLogin();
}

function showLogin(){
    document.getElementById('login-page').style.display='flex';
    document.getElementById('dashboard').style.display='none';
}

// ===================== DASHBOARD =====================
function showDashboard(){
    document.getElementById('login-page').style.display='none';
    document.getElementById('dashboard').style.display='block';
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role;

    document.getElementById('header-text').textContent = `🌸 Welcome ${currentUser.name}`;

    // Role-based cards
    if(currentUser.role === 'teacher'){
        document.getElementById('teacher-projects-card').style.display='block';
        document.getElementById('student-project-card').style.display='none';
        loadProjectSubmissions();
    } else{
        document.getElementById('teacher-projects-card').style.display='none';
        document.getElementById('student-project-card').style.display='block';
        loadAttendanceSummary();
        loadTodaysClasses();
    }
    initializeCharts();
    displayRandomQuote();
}

// ===================== MOTIVATION & DATE =====================
function displayRandomQuote(){
    const quoteElement = document.getElementById('quoteText');
    quoteElement.textContent = quotes[Math.floor(Math.random()*quotes.length)];
}
function updateDateTime(){
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString();
    document.getElementById('time').textContent = now.toLocaleTimeString();
}

// ===================== ATTENDANCE =====================
async function markAttendance(){
    if(currentUser.role!=='student'){ alert('Only students can mark'); return;}
    const statusEl = document.getElementById('status');
    const today = new Date();
    const session = today.getHours()<12?'morning':'afternoon';
    try{
        const attendanceRef = db.collection('attendance').doc(currentUser.uid).collection('records');
        const existing = await attendanceRef.where('date','==',today.toISOString().split('T')[0])
            .where('session','==',session).get();
        if(!existing.empty){ statusEl.textContent="Already marked for this session"; return;}
        await attendanceRef.add({
            date: today.toISOString().split('T')[0],
            session: session,
            status: 'present',
            timestamp: firebase.firestore.Timestamp.now(),
            location: new firebase.firestore.GeoPoint(0,0) // Replace with geofencing later
        });
        statusEl.textContent="Attendance marked ✅";
        loadAttendanceSummary();
    }catch(e){ statusEl.textContent="Error marking attendance"; console.error(e);}
}

// ===================== ATTENDANCE SUMMARY =====================
async function loadAttendanceSummary(){
    if(currentUser.role!=='student') return;
    const summaryEl = document.getElementById('attendance-summary');
    const snap = await db.collection('attendance').doc(currentUser.uid).collection('records').get();
    const total = snap.size;
    const present = snap.docs.filter(d=>d.data().status==='present').length;
    const perc = total?Math.round(present/total*100):0;
    summaryEl.innerHTML=`<p>Total Classes: ${total}</p><p>Present: ${present}</p><p>Percentage: ${perc}%</p>`;
}

// ===================== ATTENDANCE PREDICTION =====================
function attendancePrediction(){
    if(currentUser.role!=='student') return;
    const summaryEl = document.getElementById('prediction');
    // simple: risk if <75% attendance
    const present = parseInt(document.querySelector('#attendance-summary p:nth-child(2)').textContent.split(':')[1]);
    const total = parseInt(document.querySelector('#attendance-summary p:nth-child(1)').textContent.split(':')[1]);
    const perc = total?Math.round(present/total*100):0;
    summaryEl.textContent = perc<75 ? `⚠️ Low attendance risk (${perc}%)` : `✅ Good attendance (${perc}%)`;
}

// ===================== CORRECTION REQUEST =====================
async function requestCorrection(){
    if(currentUser.role!=='student') return;
    try{
        await db.collection('correctionRequests').add({
            studentId: currentUser.uid,
            name: currentUser.name,
            email: currentUser.email,
            requestedAt: firebase.firestore.Timestamp.now(),
            status:'Pending'
        });
        document.getElementById('correctionStatus').textContent="Correction requested!";
    }catch(e){ console.error(e);}
}

// ===================== PROJECT WORK =====================
async function submitProjectWork(){
    const title = prompt("Enter project title");
    if(!title) return;
    await db.collection('projectSubmissions').add({
        studentId: currentUser.uid,
        name: currentUser.name,
        email: currentUser.email,
        title,
        status:'Pending',
        submittedAt: firebase.firestore.Timestamp.now()
    });
    alert("Project submitted ✅");
}

// ===================== TEACHER PROJECT VIEW =====================
async function loadProjectSubmissions(){
    if(currentUser.role!=='teacher') return;
    const container = document.getElementById('project-submissions');
    container.innerHTML='';
    const snap = await db.collection('projectSubmissions').get();
    snap.forEach(doc=>{
        const p = doc.data();
        const div = document.createElement('div');
        div.innerHTML = `<span>${p.name}: ${p.title} - ${p.status}</span>
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}
async function updateProjectStatus(id,status){
    await db.collection('projectSubmissions').doc(id).update({status});
    loadProjectSubmissions();
}

// ===================== TODAY'S CLASSES =====================
function loadTodaysClasses(){
    const classesDemo = {
        1:['Math 9AM','Physics 11AM','CS 2PM'],
        2:['Chemistry 10AM','Biology 1PM','English 3PM'],
        3:['Math 9AM','Physics Lab 11AM','Programming 2PM'],
        4:['DS 10AM','Chem Lab 2PM'],
        5:['Project Work 9AM','Seminar 3PM'],
        6:['No Classes'],
        0:['Weekend']
    };
    const day = new Date().getDay();
    document.getElementById('todays-classes').innerHTML = classesDemo[day].map(c=>`<div>${c}</div>`).join('');
}

// ===================== CHART =====================
function initializeCharts(){
    google.charts.load('current',{packages:['corechart']});
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Day','Attendance %',{role:'style'}],
            ['Mon',85,'#667eea'],
            ['Tue',92,'#667eea'],
            ['Wed',78,'#667eea'],
            ['Thu',95,'#667eea'],
            ['Fri',88,'#667eea'],
            ['Sat',65,'#764ba2'],
            ['Sun',0,'#764ba2']
        ]);
        const options={title:'Weekly Attendance Trend',curveType:'function',legend:{position:'bottom'},backgroundColor:'transparent',vAxis:{viewWindow:{min:0,max:100}}};
        const chart=new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,options);
    });
}
