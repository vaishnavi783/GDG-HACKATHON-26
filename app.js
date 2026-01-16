let currentUser = null;

// INITIALIZE
document.addEventListener('DOMContentLoaded', function() {
    auth.onAuthStateChanged(user => {
        if (user) loadUserData(user.uid);
        else showLogin();
    });
});

// LOGIN
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    const errorElement = document.getElementById('login-error');

    if (!email || !password) { showError('Enter email & password'); return; }

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
    } catch (err) { showError(err.message || err); }
    finally { spinner.style.display='none'; loginBtn.disabled=false; }
}

function showError(msg) {
    const errorElement = document.getElementById('login-error');
    errorElement.textContent = msg;
    errorElement.style.display = 'block';
}

// LOGOUT
function logout() {
    auth.signOut();
    currentUser = null;
    localStorage.removeItem('smartAttendUser');
    showLogin();
}

function showLogin() {
    document.getElementById('login-page').style.display='block';
    document.getElementById('dashboard').style.display='none';
}

// DASHBOARD
function showDashboard() {
    document.getElementById('login-page').style.display='none';
    document.getElementById('dashboard').style.display='block';

    if(currentUser.role==='teacher') document.getElementById('teacher-projects-card').style.display='block';
    else document.getElementById('student-project-card').style.display='block';

    loadAttendanceData();
    loadTodaysClasses();
    loadProjectSubmissions();
    initializeCharts();
}

// USER DATA
async function loadUserData(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return showLogin();
    currentUser = { uid, ...doc.data() };
    showDashboard();
}

// ATTENDANCE
async function markAttendance() {
    if (currentUser.role!=='student') return alert('Only students can mark attendance');
    const today = new Date().toISOString().split('T')[0];
    const ref = db.collection('attendance').doc(currentUser.uid);
    await db.runTransaction(async tx=>{
        const doc = await tx.get(ref);
        let data = doc.exists?doc.data():{ totalClasses:0, presentCount:0, history:[] };
        data.totalClasses +=1;
        data.presentCount +=1;
        data.history.unshift({ date:today,status:'Present' });
        tx.set(ref,data);
    });
    loadAttendanceData();
}

async function loadAttendanceData() {
    const summary = document.getElementById('attendance-summary');
    if (currentUser.role==='student') {
        const doc = await db.collection('attendance').doc(currentUser.uid).get();
        const data = doc.exists?doc.data():{ totalClasses:0, presentCount:0 };
        const percent = data.totalClasses?((data.presentCount/data.totalClasses)*100).toFixed(1):0;
        summary.innerHTML=`<p>Total Classes: ${data.totalClasses}</p>
                           <p>Present: ${data.presentCount}</p>
                           <p>Percentage: ${percent}%</p>`;
    } else summary.innerHTML='Teacher dashboard';
}

// PROJECTS
async function submitProjectWork() {
    const title = prompt('Enter project title:');
    if (!title) return;
    await db.collection('projectSubmissions').add({ studentEmail:currentUser.email, studentName:currentUser.name, title, status:'Pending', submittedAt:new Date().toISOString() });
    alert('Project submitted!');
}

async function loadProjectSubmissions() {
    const container = document.getElementById('project-submissions');
    container.innerHTML='';
    if(currentUser.role!=='teacher') return;
    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach(doc=>{
        const proj = doc.data();
        const div = document.createElement('div');
        div.innerHTML=`${proj.studentName}: ${proj.title} - ${proj.status} 
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(id,status) {
    await db.collection('projectSubmissions').doc(id).update({status});
    loadProjectSubmissions();
}

// CHARTS
function initializeCharts() {
    google.charts.load('current',{packages:['corechart']});
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Day','Attendance',{role:'style'}],
            ['Mon',85,'#667eea'],['Tue',92,'#667eea'],['Wed',78,'#667eea'],
            ['Thu',95,'#667eea'],['Fri',88,'#667eea'],['Sat',65,'#764ba2'],['Sun',0,'#764ba2']
        ]);
        const options = { title:'Weekly Attendance', backgroundColor:'transparent', legend:{position:'bottom'} };
        const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,options);
        window.addEventListener('resize',()=>chart.draw(data,options));
    });
}

// CLASSES
function loadTodaysClasses() {
    const demoClasses={0:['Weekend'],1:['Math 9AM','Physics 11AM'],2:['Chem 10AM','Bio 1PM'],3:['CS 9AM','AI 2PM'],4:['DS 10AM'],5:['Project 9AM','Seminar 3PM'],6:['No classes']};
    const today = new Date().getDay();
    const clsEl = document.getElementById('todays-classes');
    clsEl.innerHTML = demoClasses[today].map(c=>`<div>${c}</div>`).join('');
}

// ONE-TIME CORRECTION
async function requestCorrection() {
    const reason = prompt('Enter reason for correction:');
    if(!reason) return;
    await db.collection('correctionRequests').add({userEmail:currentUser.email, userName:currentUser.name, reason,status:'Pending',requestedAt:new Date().toISOString()});
    alert('Correction request submitted!');
}

// ATTENDANCE PREDICTION (dummy)
function getPrediction() {
    const predictionEl = document.getElementById('prediction');
    predictionEl.textContent='Your predicted risk: '+(Math.random()*50).toFixed(1)+'%';
}
