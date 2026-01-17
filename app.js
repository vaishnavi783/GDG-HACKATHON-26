let currentUser = null;
let currentLat = 0;
let currentLng = 0;

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', () => {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();

    // Check if user is logged in
    auth.onAuthStateChanged(user => {
        if(user){
            loadUserData(user.uid);
        }else{
            showLogin();
        }
    });

    // Geolocation
    if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{
            currentLat = pos.coords.latitude;
            currentLng = pos.coords.longitude;
        });
    }
});

// ===================== LOGIN =====================
async function login(){
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    const errorElement = document.getElementById('login-error');

    if(!email || !password){ showError('Enter email & password'); return; }

    spinner.style.display = 'block'; loginBtn.disabled = true; errorElement.style.display='none';

    try{
        const userCredential = await auth.signInWithEmailAndPassword(email,password);
        const uid = userCredential.user.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        if(!userDoc.exists) throw 'User not found';
        const userData = userDoc.data();
        if(userData.role !== role) throw 'Role mismatch';

        currentUser = { uid, ...userData };
        localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

        loginBtn.innerHTML = '✓ Login Successful!';
        setTimeout(showDashboard,1000);

    }catch(err){
        showError('Login failed: '+(err.message || err));
    }finally{
        spinner.style.display='none';
        loginBtn.disabled=false;
    }
}

function showError(msg){
    const errorElement = document.getElementById('login-error');
    errorElement.innerHTML=msg; errorElement.style.display='block';
}

function logout(){
    auth.signOut();
    localStorage.removeItem('smartAttendUser');
    currentUser=null;
    showLogin();
}

function showLogin(){
    document.getElementById('login-page').style.display='block';
    document.getElementById('dashboard').style.display='none';
}

// ===================== DASHBOARD =====================
async function showDashboard(){
    document.getElementById('login-page').style.display='none';
    document.getElementById('dashboard').style.display='block';
    document.getElementById('user-email').textContent=currentUser.email;
    document.getElementById('user-role').textContent=currentUser.role;

    if(currentUser.role==='teacher'){
        document.getElementById('teacher-projects-card').style.display='block';
        loadProjectSubmissions();
        loadCorrectionRequests();
    }else{
        document.getElementById('student-project-card').style.display='block';
        loadAttendanceSummary();
        loadTodaysClasses();
        loadCorrectionRequests();
    }

    initializeCharts();
}

// ===================== ATTENDANCE =====================
async function markAttendance(session){
    const today = new Date().toISOString().split('T')[0];
    const attendanceRef = db.collection('attendance').doc(currentUser.uid).collection('records');

    const existing = await attendanceRef.where('date','==',today).where('session','==',session).get();
    if(!existing.empty){ alert('Already marked for '+session); return; }

    await attendanceRef.add({
        date: today,
        session,
        status:'present',
        timestamp:firebase.firestore.Timestamp.now(),
        location: new firebase.firestore.GeoPoint(currentLat,currentLng)
    });
    alert('Attendance marked: '+session);
    loadAttendanceSummary();
}

// ===================== ATTENDANCE SUMMARY =====================
async function loadAttendanceSummary(){
    const summary = document.getElementById('attendance-summary');
    const docRef = db.collection('attendance').doc(currentUser.uid).collection('records');
    const snapshot = await docRef.get();
    let total=0, present=0;
    snapshot.forEach(d=>{
        total++;
        if(d.data().status==='present') present++;
    });
    const percent = total? (present/total*100).toFixed(1):0;
    summary.innerHTML=`<p>Total Classes: ${total}</p><p>Present: ${present}</p><p>Percentage: ${percent}%</p>`;
}

// ===================== TODAY CLASSES =====================
function loadTodaysClasses(){
    const demoClasses = {
        1:['Mathematics 9AM','Physics 11AM','CS 2PM'],
        2:['Chemistry 10AM','Biology 1PM','English 3PM'],
        3:['Math 9AM','Physics Lab 11AM','Programming 2PM'],
        4:['DS 10AM','Chemistry Lab 2PM'],
        5:['Project Work 9AM','Seminar 3PM'],
        6:['No Regular Classes'],
        0:['Weekend - No Classes']
    };
    const today = new Date().getDay();
    const classesElement = document.getElementById('todays-classes');
    classesElement.innerHTML = demoClasses[today].map(c=>`<div>${c}</div>`).join('');
}

// ===================== CORRECTION REQUEST =====================
function promptCorrection(){
    const reason = prompt('Enter reason for correction');
    const date = prompt('Enter date (YYYY-MM-DD)');
    const session = prompt('Enter session: morning / afternoon');
    const teacherId = prompt('Enter Teacher UID');
    if(!reason||!date||!session||!teacherId) return;
    requestCorrection(session,date,reason,teacherId);
}

async function requestCorrection(session,date,reason,teacherId){
    await db.collection('correctionRequests').add({
        studentId:currentUser.uid,
        studentName:currentUser.name,
        session,
        date:firebase.firestore.Timestamp.fromDate(new Date(date)),
        reason,
        status:'Pending',
        teacherId,
        submittedAt:firebase.firestore.Timestamp.now()
    });
    alert('Correction request submitted');
    loadCorrectionRequests();
}

async function loadCorrectionRequests(){
    const container = document.getElementById('correction-requests');
    container.innerHTML='';
    let snapshot;
    if(currentUser.role==='teacher'){
        snapshot = await db.collection('correctionRequests').where('teacherId','==',currentUser.uid).get();
    }else{
        snapshot = await db.collection('correctionRequests').where('studentId','==',currentUser.uid).get();
    }
    snapshot.forEach(doc=>{
        const req = doc.data();
        const div = document.createElement('div');
        div.innerHTML=`<span>${req.studentName} - ${req.session} ${req.date.toDate().toDateString()} - ${req.status}</span>
        ${currentUser.role==='teacher'?`<button onclick="updateCorrectionStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateCorrectionStatus('${doc.id}','Rejected')">Reject</button>`:''}`;
        container.appendChild(div);
    });
}

async function updateCorrectionStatus(docId,status){
    await db.collection('correctionRequests').doc(docId).update({status});
    loadCorrectionRequests();
}

// ===================== PROJECT SUBMISSIONS =====================
function submitProjectPrompt(){
    const title = prompt('Enter Project Title');
    if(!title) return;
    submitProjectWork(title);
}

async function submitProjectWork(title){
    await db.collection('projectSubmissions').add({
        studentId:currentUser.uid,
        studentName:currentUser.name,
        title,
        status:'Pending',
        submittedAt:firebase.firestore.Timestamp.now()
    });
    alert('Project submitted');
    loadProjectSubmissions();
}

async function loadProjectSubmissions(){
    const container = document.getElementById('project-submissions');
    container.innerHTML='';
    const snapshot = await db.collection('projectSubmissions').get();
    snapshot.forEach(doc=>{
        const proj = doc.data();
        const div = document.createElement('div');
        div.className='project-item';
        div.innerHTML=`<span>${proj.studentName}: ${proj.title} - ${proj.status}</span>
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(docId,status){
    await db.collection('projectSubmissions').doc(docId).update({status});
    loadProjectSubmissions();
}

// ===================== ATTENDANCE PREDICTION =====================
async function showAttendancePrediction(){
    const snapshot = await db.collection('attendance').doc(currentUser.uid).collection('records').get();
    let total=0, present=0;
    snapshot.forEach(d=>{
        total++;
        if(d.data().status==='present') present++;
    });
    const risk = total?(100 - (present/total*100)).toFixed(1):0;
    document.getElementById('prediction').textContent = `Predicted Risk of Missing Attendance: ${risk}%`;
}

// ===================== DATE / TIME / QUOTES =====================
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

function displayRandomQuote(){
    const quoteElement = document.getElementById('quoteText');
    quoteElement.textContent = quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>{
        quoteElement.textContent = quotes[Math.floor(Math.random()*quotes.length)];
    },30000);
}

function updateDateTime(){
    const now = new Date();
    document.getElementById('date').textContent = now.toLocaleDateString('en-US',{weekday
