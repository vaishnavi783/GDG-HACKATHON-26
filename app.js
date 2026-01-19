let currentUser = null;

// ===== UTILS =====
function todayDate() {
  return new Date().toISOString().split("T")[0];
}
function randomToken() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Haversine distance
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * (2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// ===== LOGIN =====
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;
  const err = document.getElementById("login-error");
  err.style.display = "none";

  try {
    const cred = await auth.signInWithEmailAndPassword(email,password);
    const snap = await db.collection("users").doc(cred.user.uid).get();
    if(!snap.exists || snap.data().role !== role) throw "Role mismatch";

    currentUser = { uid: cred.user.uid, ...snap.data() };
    showDashboard();

  } catch(e) {
    err.innerText = e;
    err.style.display = "block";
  }
}

function logout() {
  auth.signOut();
  location.reload();
}

// ===== DASHBOARD =====
function showDashboard() {
  document.getElementById("login-page").style.display = "none";
  document.getElementById("dashboard").style.display = "block";

  document.getElementById("user-email").innerText = currentUser.email;
  document.getElementById("user-role").innerText = currentUser.role;
  document.getElementById("quoteText").innerText = "Consistency beats motivation.";

  // SHOW tabs based on role
  if(currentUser.role === "teacher") {
    document.querySelectorAll(".teacher-only").forEach(el=>el.style.display="block");
  } else {
    document.querySelectorAll(".student-only").forEach(el=>el.style.display="block");
  }

  loadTodayClasses();
  loadAuditLogs();
  loadAuditGraph();

  if(currentUser.role==="teacher") {
    loadCorrections();
    loadEditableClasses();
  }
}

// ===== GENERATE QR =====
async function generateQR() {
  const clsSnap = await db.collection("classes").where("teacherId","==",currentUser.uid).get();
  if(clsSnap.empty) return alert("No classes assigned");

  let html="";
  clsSnap.forEach(clsDoc=>{
    const token=randomToken();
    db.collection("qr_sessions").add({
      classId: clsDoc.id,
      teacherId: currentUser.uid,
      qrToken: token,
      validFrom: firebase.firestore.Timestamp.now(),
      validTill: firebase.firestore.Timestamp.fromDate(new Date(Date.now()+5*60000)),
      active:true
    });
    html += `<p><b>${clsDoc.data().className}:</b> ${token}</p>`;
    logAudit("QR_GENERATED");
  });

  document.getElementById("qr-output").innerHTML=html;
}

// ===== EDIT CLASSES =====
async function loadEditableClasses() {
  const box=document.getElementById("edit-classes");
  const snap=await db.collection("classes").where("teacherId","==",currentUser.uid).get();
  box.innerHTML="";
  snap.forEach(d=>{
    const c=d.data();
    box.innerHTML += `<p><input id="class-${d.id}" value="${c.className}">
    <button onclick="updateClass('${d.id}')">Update</button></p>`;
  });
}

async function updateClass(classId){
  const val=document.getElementById(`class-${classId}`).value;
  await db.collection("classes").doc(classId).update({className:val});
  logAudit("CLASS_UPDATED");
  loadEditableClasses();
}

// ===== TODAY'S CLASSES =====
async function loadTodayClasses() {
  const box=document.getElementById("todays-classes");
  const ref=currentUser.role==="teacher"
    ? db.collection("classes").where("teacherId","==",currentUser.uid)
    : db.collection("classes").where("department","==",currentUser.department).where("year","==",currentUser.year);

  const snap=await ref.get();
  box.innerHTML="";
  snap.forEach(d=>{
    const c=d.data();
    box.innerHTML += `<p>${c.className} (${c.startTime}-${c.endTime})</p>`;
  });
}

// ===== AUDIT LOGS =====
async function loadAuditLogs() {
  const box=document.getElementById("audit-logs");
  const snap=await db.collection("audit_logs").where("userId","==",currentUser.uid).orderBy("timestamp","desc").limit(10).get();
  box.innerHTML="";
  snap.forEach(d=>{
    box.innerHTML += `<p>${d.data().action}</p>`;
  });
}

// ===== AUDIT GRAPH =====
google.charts.load("current",{packages:["corechart"]});
async function loadAuditGraph(){
  const snap=await db.collection("audit_logs").get();
  const map={};
  snap.forEach(d=>map[d.data().action]=(map[d.data().action]||0)+1);
  const rows=[["Action","Count"]];
  Object.entries(map).forEach(([k,v])=>rows.push([k,v]));
  google.charts.setOnLoadCallback(()=>{
    const chart=new google.visualization.PieChart(document.getElementById("auditGraph"));
    chart.draw(google.visualization.arrayToDataTable(rows),{title:"Audit Activity"});
  });
}

// ===== AUDIT HELPER =====
function logAudit(action){
  db.collection("audit_logs").add({
    userId:currentUser.uid,
    role:currentUser.role,
    action,
    details:"",
    timestamp:firebase.firestore.FieldValue.serverTimestamp()
  });
}
