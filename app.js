let currentUser = null;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime,1000);
    displayRandomQuote();

    auth.onAuthStateChanged(user => {
        if(user) loadUserData(user.uid);
        else showLogin();
    });
});

// ================= LOGIN =================
async function login(){
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    const spinner = document.getElementById('login-spinner');
    const btn = document.querySelector('#login-page button');
    const error = document.getElementById('login-error');

    if(!email || !password){ showError('Enter email & password'); return; }

    spinner.style.display='block';
    btn.disabled=true; error.style.display='none';

    try{
        const userCredential = await auth.signInWithEmailAndPassword(email,password);
        const uid = userCredential.user.uid;
        const doc = await db.collection('users').doc(uid).get();
        if(!doc.exists) throw 'User data not found';
        const userData = doc.data();
        if(userData.role!==role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

        btn.innerHTML='✓ Login Successful!'; btn.style.background='#2ecc71';
        setTimeout(showDashboard,1000);
    }catch(err){
        showError('Login failed: '+ (err.message || err));
    }finally{
        spinner.style.display='none';
        btn.disabled=false;
    }
}

function showError(msg){
    const e = document.getElementById('login-error');
    e.innerText=msg; e.style.display='block';
}

// ================= LOGOUT =================
function logout(){
    if(confirm('Logout?')){
        auth.signOut();
        localStorage.removeItem('smartAttendUser');
        currentUser=null;
        showLogin();
    }
}

function showLogin(){
    document.getElementById('login-page').style.display='flex';
    document.getElementById('dashboard').style.display='none';
}

// ================= DASHBOARD =================
function showDashboard(){
    document.getElementById('login-page').style.display='none';
    document.getElementById('dashboard').style.display='block';
    document.getElementById('user-email').innerText=currentUser.email;
    document.getElementById('user-role').innerText=currentUser.role;

    initializeCharts();
    loadAttendanceData();
    loadTodaysClasses();

    if(currentUser.role==='teacher') document.getElementById('teacher-projects-card').style.display='block';
    else document.getElementById('student-project-card').style.display='block';

    if(currentUser.role==='teacher') loadProjectSubmissions();
}

// ================= DATE & QUOTES =================
const quotes=[
    "Education is the most powerful weapon. - Nelson Mandela",
    "The future belongs to those who believe in dreams. - Eleanor Roosevelt",
    "Success is courage to continue. - Winston Churchill",
    "Your time is limited. - Steve Jobs"
];

function displayRandomQuote(){
    const q=document.getElementById('quoteText');
    q.innerText=quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>{q.innerText=quotes[Math.floor(Math.random()*quotes.length)]},30000);
}

function updateDateTime(){
    const now=new Date();
    document.getElementById('date').innerText=now.toLocaleDateString();
    document.getElementById('time').innerText=now.toLocaleTimeString();
}

// ================= ATTENDANCE =================
async function markAttendance(){
    if(currentUser.role!=='student'){ alert('Only students can mark attendance'); return; }
    const status=document.getElementById('status'); status.innerText='Marking...';
    try{
        const today = new Date().toISOString().split('T')[0];
        const ref = db.collection('attendance').doc(currentUser.uid);
        await db.runTransaction(async t=>{
            const doc = await t.get(ref);
            const data = doc.exists ? doc.data() : {totalClasses:0,presentCount:0,history:[]};
            data.totalClasses++; data.presentCount++;
            data.history.unshift({date:today,status:'Present'});
            t.set(ref,data);
        });
        status.innerText='✅ Attendance marked';
        loadAttendanceData();
    }catch(err){
        status.innerText='❌ Failed';
        console.error(err);
    }
}

async function loadAttendanceData(){
    const sum = document.getElementById('attendance-summary');
    if(currentUser.role==='student'){
        const doc = await db.collection('attendance').doc(currentUser.uid).get();
        const data = doc.exists ? doc.data() : {totalClasses:0,presentCount:0};
        const pct = data.totalClasses ? (data.presentCount/data.totalClasses*100).toFixed(1) : 0;
        sum.innerHTML=`Total: ${data.totalClasses}<br>Present: ${data.presentCount}<br>Percentage: ${pct}%`;
    }else sum.innerHTML='Teacher dashboard';
}

// ================= PROJECT WORK =================
async function submitProjectWork(){
    const title=prompt('Enter project title'); if(!title) return;
    await db.collection('projectSubmissions').add({
        studentEmail:currentUser.email,
        studentName:currentUser.name,
        title:title,
        status:'Pending',
        submittedAt:new Date().toISOString()
    });
    showNotification('Project submitted','success');
}

async function loadProjectSubmissions(){
    const container=document.getElementById('project-submissions');
    container.innerHTML='';
    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach(doc=>{
        const p=doc.data();
        const div=document.createElement('div'); div.className='project-item';
        div.innerHTML=`<span>${p.studentName}: ${p.title} - ${p.status}</span>
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(docId,status){
    await db.collection('projectSubmissions').doc(docId).update({status});
    loadProjectSubmissions();
    showNotification(`Project ${status}`,status==='Approved'?'success':'error');
}

// ================= CHARTS =================
function initializeCharts(){
    google.charts.load('current',{packages:['corechart']});
    google.charts.setOnLoadCallback(()=>{
        const data = google.visualization.arrayToDataTable([
            ['Day','Attendance %',{role:'style'}],
            ['Mon',85,'#667eea'],['Tue',92,'#667eea'],['Wed',78,'#667eea'],
            ['Thu',95,'#667eea'],['Fri',88,'#667eea'],['Sat',65,'#764ba2'],['Sun',0,'#764ba2']
        ]);
        const options={title:'Weekly Attendance',legend:{position:'bottom'},backgroundColor:'transparent'};
        const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,options);
        window.addEventListener('resize',()=>chart.draw(data,options));
    });
}

// ================= TODAY CLASSES =================
function loadTodaysClasses(){
    const demo={1:['Math','Physics'],2:['Chemistry','Bio'],3:['CS'],4:['DS'],5:['Project'],6:['No Classes'],0:['Weekend']};
    const today=new Date().getDay();
    document.getElementById('todays-classes').innerHTML=demo[today].map(c=>`<div>${c}</div>`).join('');
}

// ================= NOTIFICATIONS =================
function showNotification(msg,type='info'){
    const n=document.createElement('div'); n.className='notification '+type;
    n.innerHTML=`<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(n);
    setTimeout(()=>{if(n.parentElement) n.remove();},5000);
}

// ================= LOAD USER =================
async function loadUserData(uid){
    const doc=await db.collection('users').doc(uid).get();
    if(!doc.exists) return showLogin();
    currentUser={uid,...doc.data()};
    localStorage.setItem('smartAttendUser',JSON.stringify(currentUser));
    showDashboard();
}

// ================= ONE-TIME CORRECTION =================
async function requestCorrection(){
    const reason=prompt('Enter correction reason'); if(!reason) return;
    await db.collection('correctionRequests').add({
        studentName:currentUser.name,
        studentEmail:currentUser.email,
        reason:reason,
        status:'Pending',
        submittedAt:new Date().toISOString()
    });
    showNotification('Correction requested','success');
}

// ================= ATTENDANCE PREDICTION =================
function getPrediction(){
    const p=Math.floor(Math.random()*30)+70;
    document.getElementById('prediction').innerText=`Attendance Risk: ${p}%`;
}
