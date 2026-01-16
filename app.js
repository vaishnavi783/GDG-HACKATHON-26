let currentUser = null;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
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
    const email=document.getElementById('email').value.trim();
    const password=document.getElementById('password').value;
    const role=document.getElementById('role').value;
    const spinner=document.getElementById('login-spinner');
    const loginBtn=document.querySelector('.login-card button');
    const errorElement=document.getElementById('login-error');

    if(!email||!password){ showError('Please enter email & password'); return; }

    spinner.style.display='block';
    loginBtn.disabled=true;
    errorElement.style.display='none';

    try{
        const userCredential=await auth.signInWithEmailAndPassword(email,password);
        const uid=userCredential.user.uid;

        const userDoc=await db.collection('users').doc(uid).get();
        if(!userDoc.exists) throw 'User not found';
        const userData=userDoc.data();
        if(userData.role!==role) throw 'Role mismatch';

        currentUser={uid,...userData};
        localStorage.setItem('smartAttendUser',JSON.stringify(currentUser));

        loginBtn.innerHTML='✓ Login Successful!';
        loginBtn.style.backgroundColor='#2ecc71';
        setTimeout(showDashboard,1000);
    }catch(error){
        showError('Login failed: '+(error.message||error));
    }finally{
        spinner.style.display='none';
        loginBtn.disabled=false;
    }
}

function showError(msg){
    const errorElement=document.getElementById('login-error');
    errorElement.innerHTML=msg;
    errorElement.style.display='block';
}

// ================= LOGOUT =================
function logout(){
    if(confirm('Are you sure you want to logout?')){
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
    document.getElementById('user-email').textContent=currentUser.email;
    document.getElementById('user-role').textContent=currentUser.role.charAt(0).toUpperCase()+currentUser.role.slice(1);
    document.querySelector('header').innerHTML=`🌸 Smart Attendance & Wellness Portal | Welcome, ${currentUser.name} <button onclick="logout()" class="logout-btn">Logout</button>`;

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

// ================= DATE & QUOTE =================
const quotes=[
    "Education is the most powerful weapon which you can use to change the world. - Nelson Mandela",
    "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
    "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
    "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
    "Believe you can and you're halfway there. - Theodore Roosevelt",
    "The secret of getting ahead is getting started. - Mark Twain"
];

function displayRandomQuote(){
    const quoteElement=document.getElementById('quoteText');
    quoteElement.textContent=quotes[Math.floor(Math.random()*quotes.length)];
    setInterval(()=>{quoteElement.textContent=quotes[Math.floor(Math.random()*quotes.length)];},30000);
}

function updateDateTime(){
    const now=new Date();
    document.getElementById('date').textContent=now.toLocaleDateString('en-US',{weekday:'long', year:'numeric', month:'long', day:'numeric'});
    document.getElementById('time').textContent=now.toLocaleTimeString('en-US',{hour12:true, hour:'2-digit', minute:'2-digit'});
}

// ================= ATTENDANCE =================
async function markAttendance(){
    if(currentUser.role!=='student'){ alert('Only students can mark attendance'); return; }
    const statusElement=document.getElementById('status');
    statusElement.innerHTML='📷 Scanning QR...';
    try{
        const today=new Date().toISOString().split('T')[0];
        const attendanceRef=db.collection('attendance').doc(currentUser.uid);
        await db.runTransaction(async transaction=>{
            const doc=await transaction.get(attendanceRef);
            let data=doc.exists?doc.data():{totalClasses:0,presentCount:0,history:[]};
            data.totalClasses+=1;
            data.presentCount+=1;
            data.history.unshift({date:today,status:'Present'});
            transaction.set(attendanceRef,data);
        });
        statusElement.innerHTML='✅ Attendance marked!';
        loadAttendanceData();
    }catch(err){
        statusElement.innerHTML='❌ Failed';
        console.error(err);
    }
}

async function loadAttendanceData(){
    const summaryElement=document.getElementById('attendance-summary');
    if(currentUser.role==='student'){
        try{
            const doc=await db.collection('attendance').doc(currentUser.uid).get();
            const data=doc.exists?doc.data():{totalClasses:0,presentCount:0};
            const percent=data.totalClasses?((data.presentCount/data.totalClasses)*100).toFixed(1):0;
            summaryElement.innerHTML=`<p>Total Classes: ${data.totalClasses}</p><p>Present: ${data.presentCount}</p><p>Percentage: ${percent}%</p>`;
        }catch(err){ console.error(err);}
    } else summaryElement.innerHTML=`<p>Teacher dashboard: View student attendance</p>`;
}

// ================= PREDICTION =================
async function getPrediction(){
    const doc=await db.collection('attendance').doc(currentUser.uid).get();
    const data=doc.exists?doc.data():{totalClasses:0,presentCount:0};
    let risk='Low';
    if(data.totalClasses>0){
        const percent=(data.presentCount/data.totalClasses)*100;
        if(percent<60) risk='High';
        else if(percent<80) risk='Medium';
    }
    document.getElementById('prediction').textContent=`Attendance Risk: ${risk}`;
}

// ================= ONE-TIME CORRECTION =================
async function requestCorrection(){
    const reason=prompt('Enter reason for correction:');
    if(!reason) return;
    try{
        await db.collection('correctionRequests').add({
            studentName:currentUser.name,
            studentEmail:currentUser.email,
            reason,
            submittedAt:new Date().toISOString(),
            status:'Pending'
        });
        document.getElementById('correctionStatus').textContent='Request submitted!';
    }catch(err){ console.error(err);}
}

// ================= PROJECT WORK =================
async function submitProjectWork(){
    const title=prompt('Enter Project Title:');
    if(!title) return;
    try{
        await db.collection('projectSubmissions').add({
            studentName:currentUser.name,
            studentEmail:currentUser.email,
            title,
            submittedAt:new Date().toISOString(),
            status:'Pending'
        });
        showNotification('Project submitted','success');
    }catch(err){ showNotification('Failed to submit','error'); }
}

async function loadProjectSubmissions(){
    const container=document.getElementById('project-submissions');
    container.innerHTML='';
    const snapshot=await db.collection('projectSubmissions').get();
    snapshot.forEach(doc=>{
        const proj=doc.data();
        const div=document.createElement('div');
        div.className='project-item';
        div.innerHTML=`<span>${proj.studentName}: ${proj.title} - ${proj.status}</span>
        <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
        <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
        container.appendChild(div);
    });
}

async function updateProjectStatus(id,status){
    await db.collection('projectSubmissions').doc(id).update({status});
    loadProjectSubmissions();
    showNotification(`Project ${status}`,status==='Approved'?'success':'error');
}

// ================= TODAY'S CLASSES =================
function loadTodaysClasses(){
    const demo={
        1:['Math (9AM)','Physics (11AM)','CS (2PM)'],
        2:['Chemistry (10AM)','Biology (1PM)','English (3PM)'],
        3:['Math (9AM)','Physics Lab (11AM)','Programming (2PM)'],
        4:['DS (10AM)','Chemistry Lab (2PM)'],
        5:['Project Work (9AM)','Seminar (3PM)'],
        6:['No Classes'],0:['Weekend']
    };
    const today=new Date().getDay();
    document.getElementById('todays-classes').innerHTML=demo[today].map(c=>`<div>${c}</div>`).join('');
}

// ================= AUDIT LOGS =================
function initializeCharts(){
    google.charts.load('current',{packages:['corechart']});
    google.charts.setOnLoadCallback(async ()=>{
        const snapshot=await db.collection('attendance').get();
        const dataArr=[['Student','Present %',{role:'style'}]];
        snapshot.forEach(doc=>{
            const d=doc.data();
            const percent=d.totalClasses?((d.presentCount/d.totalClasses)*100).toFixed(1):0;
            dataArr.push([d.name||doc.id,parseFloat(percent),'#667eea']);
        });
        const data=google.visualization.arrayToDataTable(dataArr);
        const options={title:'Attendance Summary', legend:{position:'bottom'}, backgroundColor:'transparent', vAxis:{viewWindow:{min:0,max:100}}};
        const chart=new google.visualization.ColumnChart(document.getElementById('chart_div'));
        chart.draw(data,options);
        window.addEventListener('resize',()=>chart.draw(data,options));
    });
}

// ================= NOTIFICATION =================
function showNotification(msg,type='info'){
    const n=document.createElement('div');
    n.className=`notification ${type}`;
    n.innerHTML=`<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(n);
    setTimeout(()=>{ if(n.parentElement) n.remove(); },5000);
}

// ================= LOAD USER =================
async function loadUserData(uid){
    const userDoc=await db.collection('users').doc(uid).get();
    if(!userDoc.exists) return showLogin();
    currentUser={uid,...userDoc.data()};
    localStorage.setItem('smartAttendUser',JSON.stringify(currentUser));
    showDashboard();
}
