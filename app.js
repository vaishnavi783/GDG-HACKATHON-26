const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// -------------------- INITIALIZATION --------------------
document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  displayRandomQuote();

  auth.onAuthStateChanged(user => {
    if(user){
      loadUserData(user.uid);
    } else {
      showLogin();
    }
  });
});

// -------------------- LOGIN --------------------
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role = document.getElementById('role').value;
  const spinner = document.getElementById('login-spinner');
  const loginBtn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');

  if(!email || !password){
    errorEl.innerText = "Enter email and password";
    errorEl.style.display = "block";
    return;
  }

  spinner.style.display = 'block';
  loginBtn.disabled = true;
  errorEl.style.display = 'none';

  try{
    const userCredential = await auth.signInWithEmailAndPassword(email,password);
    const user = userCredential.user;
    const userDoc = await db.collection('users').doc(user.uid).get();
    if(!userDoc.exists) throw "User data not found";

    const userData = userDoc.data();
    if(userData.role !== role) throw `Role mismatch: you selected ${role} but your role is ${userData.role}`;

    currentUser = { uid: user.uid, ...userData };
    localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));

    loginBtn.innerText = "✓ Login Successful!";
    loginBtn.style.backgroundColor = "#2ecc71";

    setTimeout(() => showDashboard(), 1000);

  } catch(err){
    console.error(err);
    errorEl.innerText = "Login failed: "+err.message||err;
    errorEl.style.display = 'block';
  } finally {
    spinner.style.display = 'none';
    loginBtn.disabled = false;
  }
});

// -------------------- DASHBOARD --------------------
function showDashboard(){
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  document.getElementById('user-email').innerText = currentUser.email;
  document.getElementById('user-role').innerText = currentUser.role.charAt(0).toUpperCase()+currentUser.role.slice(1);

  if(currentUser.role === 'teacher'){
    document.getElementById('teacher-projects-card').style.display = 'block';
    loadProjectSubmissions();
  } else {
    document.getElementById('student-project-card').style.display = 'block';
  }

  initializeCharts();
  loadAttendanceData();
  loadTodaysClasses();
}

// -------------------- LOGOUT --------------------
function logout(){
  auth.signOut();
  localStorage.removeItem('smartAttendUser');
  currentUser = null;
  showLogin();
}

function showLogin(){
  document.getElementById('login-page').style.display='block';
  document.getElementById('dashboard').style.display='none';
}

// -------------------- DATE & QUOTES --------------------
function updateDateTime(){
  const now = new Date();
  document.getElementById('date').innerText = now.toDateString();
  document.getElementById('time').innerText = now.toLocaleTimeString();
}

const quotes = ["Education is powerful.","Believe in yourself.","Time is precious."];
function displayRandomQuote(){
  const quoteEl = document.getElementById('quoteText');
  quoteEl.innerText = quotes[Math.floor(Math.random()*quotes.length)];
  setInterval(()=>{ quoteEl.innerText = quotes[Math.floor(Math.random()*quotes.length)]; }, 30000);
}

// -------------------- ATTENDANCE --------------------
async function markAttendance(){
  if(currentUser.role!=='student'){ alert("Only students can mark"); return;}
  const statusEl = document.getElementById('attendance-status');
  const today = new Date().toISOString().split('T')[0];
  const session = (new Date().getHours()<12)? 'morning':'afternoon'; // morning/afternoon

  const docRef = db.collection('attendance').doc(currentUser.uid).collection('records').doc();
  try{
    await docRef.set({
      date: today,
      session: session,
      status: "present",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      location: new firebase.firestore.GeoPoint(0,0) // replace with geolocation
    });
    statusEl.innerText = `✅ Attendance marked for ${session}`;
    loadAttendanceData();
  }catch(err){
    console.error(err);
    statusEl.innerText = "❌ Failed to mark attendance";
  }
}

// -------------------- ATTENDANCE DATA --------------------
async function loadAttendanceData(){
  if(currentUser.role!=='student') return;
  const summaryEl = document.getElementById('attendance-summary');
  const snapshot = await db.collection('attendance').doc(currentUser.uid).collection('records').get();
  const total = snapshot.size;
  const present = snapshot.docs.filter(d=>d.data().status==='present').length;
  const percentage = total?((present/total)*100).toFixed(1):0;

  document.getElementById('total-classes').innerText = total;
  document.getElementById('present-count').innerText = present;
  document.getElementById('attendance-percentage').innerText = percentage+"%";
}

// -------------------- PROJECT SUBMISSIONS --------------------
async function submitProjectWork(){
  const title = prompt("Enter project title:");
  if(!title) return;
  try{
    await db.collection('projectSubmissions').add({
      studentName: currentUser.name,
      studentEmail: currentUser.email,
      title: title,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "Pending"
    });
    alert("Project submitted!");
  }catch(err){console.error(err);}
}

async function loadProjectSubmissions(){
  const container = document.getElementById('project-submissions');
  container.innerHTML='';
  const snapshot = await db.collection('projectSubmissions').get();
  snapshot.forEach(doc=>{
    const d = doc.data();
    const div = document.createElement('div');
    div.innerHTML = `${d.studentName}: ${d.title} - ${d.status} 
      <button onclick="updateProjectStatus('${doc.id}','Approved')">Approve</button>
      <button onclick="updateProjectStatus('${doc.id}','Rejected')">Reject</button>`;
    container.appendChild(div);
  });
}

async function updateProjectStatus(docId,status){
  await db.collection('projectSubmissions').doc(docId).update({status});
  loadProjectSubmissions();
}

// -------------------- CHARTS --------------------
function initializeCharts(){
  google.charts.load('current', {packages:['corechart']});
  google.charts.setOnLoadCallback(()=>{
    const data = google.visualization.arrayToDataTable([
      ['Day','Attendance',{role:'style'}],
      ['Mon',80,'#667eea'],
      ['Tue',90,'#667eea'],
      ['Wed',75,'#667eea'],
      ['Thu',85,'#667eea'],
      ['Fri',95,'#667eea'],
      ['Sat',70,'#764ba2'],
      ['Sun',0,'#764ba2']
    ]);
    const options = {title:'Weekly Attendance',legend:{position:'bottom'},backgroundColor:'transparent'};
    const chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
    chart.draw(data,options);
    window.addEventListener('resize',()=>chart.draw(data,options));
  });
}

// -------------------- TODAY'S CLASSES --------------------
function loadTodaysClasses(){
  const demo = {0:['Weekend'],1:['Math','Physics','CS'],2:['Chem','Bio','Eng'],3:['Math','Physics Lab','Programming'],4:['DS','Chem Lab'],5:['Project','Seminar'],6:['No Classes']};
  const today = new Date().getDay();
  document.getElementById('todays-classes').innerHTML = demo[today].map(c=>`<div>${c}</div>`).join('');
}
