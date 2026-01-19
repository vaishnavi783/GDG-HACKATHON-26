let currentUser = null;

// ===== UTILS =====
function todayDate() {
return new Date().toISOString().split("T")[0];
}
function randomToken() {
return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Haversine distance for geofence
function getDistance(lat1, lon1, lat2, lon2) {
const R = 6371000;
const dLat = (lat2 - lat1) * Math.PI / 180;
const dLon = (lon2 - lon1) * Math.PI / 180;
const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)Math.cos(lat2Math.PI/180)Math.sin(dLon/2)**2;
return R * (2Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
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

document.querySelectorAll(".teacher-only").forEach(el => el.style.display = "none");
document.querySelectorAll(".student-only").forEach(el => el.style.display = "none");

if(currentUser.role==="teacher") {
document.querySelectorAll(".teacher-only").forEach(el => el.style.display = "block");
loadCorrections();
loadEditableClasses();
} else if(currentUser.role==="student") {
document.querySelectorAll(".student-only").forEach(el => el.style.display = "block");
}

loadTodayClasses();
loadAuditLogs();
loadAuditGraph();
}

// ===== GENERATE QR =====
async function generateQR() {
const clsSnap = await db.collection("classes").where("teacherId","==",currentUser.uid).get();
if(clsSnap.empty) return alert("No classes assigned");

let html="";
for(const clsDoc of clsSnap.docs){
const token=randomToken();
await db.collection("qr_sessions").add({
classId: clsDoc.id,
teacherId: currentUser.uid,
qrToken: token,
validFrom: firebase.firestore.Timestamp.now(),
validTill: firebase.firestore.Timestamp.fromDate(new Date(Date.now()+5*60000)),
active:true
});
html += <p><b>${clsDoc.data().className}:</b> ${token}</p>;
logAudit("QR_GENERATED");
}
document.getElementById("qr-output").innerHTML=html;
}

// ===== EDIT CLASSES =====
async function loadEditableClasses() {
const box=document.getElementById("edit-classes");
const snap=await db.collection("classes").where("teacherId","==",currentUser.uid).get();
box.innerHTML="";
if(snap.empty){
box.innerHTML="<p>No classes assigned</p>";
return;
}
snap.forEach(d=>{
const c=d.data();
box.innerHTML += <p><input id="class-${d.id}" value="${c.className}">   <button onclick="updateClass('${d.id}')">Update</button></p>;
});
}

async function updateClass(classId){
const val=document.getElementById(class-${classId}).value;
await db.collection("classes").doc(classId).update({className:val});
logAudit("CLASS_UPDATED");
loadEditableClasses();
}

// ===== TODAY'S CLASSES =====
async function loadTodayClasses() {
const box=document.getElementById("todays-classes");
const ref = currentUser.role==="teacher"
? db.collection("classes").where("teacherId","==",currentUser.uid)
: db.collection("classes")
.where("department","==",currentUser.department)
.where("year","==",currentUser.year);

const snap=await ref.get();
box.innerHTML="";
if(snap.empty){
box.innerHTML="<p>No classes scheduled for today</p>";
return;
}
snap.forEach(d=>{
const c=d.data();
box.innerHTML += <p>${c.className} (${c.startTime}-${c.endTime})</p>;
});
}

// ===== AUDIT LOGS =====
async function loadAuditLogs() {
const box=document.getElementById("audit-logs");
const snap=await db.collection("audit_logs")
.where("userId","==",currentUser.uid)
.orderBy("timestamp","desc").limit(10).get();
box.innerHTML="";
snap.forEach(d=>{
box.innerHTML += <p>${d.data().action}</p>;
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

// ===== STUDENT ATTENDANCE =====
async function markAttendance() {
if(!navigator.geolocation){
return alert("Geolocation not supported on this device.");
}

const qrToken = prompt("Enter QR Token:").trim();
if(!qrToken) return;

const qrSnap = await db.collection("qr_sessions")
.where("qrToken","==",qrToken)
.where("active","==",true)
.get();
if(qrSnap.empty) return alert("Invalid QR Token.");

const qrDoc = qrSnap.docs[0];
const qrData = qrDoc.data();

const now = new Date();
if(now > qrData.validTill.toDate()) return alert("QR expired.");

const classSnap = await db.collection("classes").doc(qrData.classId).get();
const cls = classSnap.data();
if(!cls.lat || !cls.lon) return alert("Class location not set.");

const geoSnap = await db.collection("geo_fences").doc("college").get();
const geo = geoSnap.data();
const radius = geo?.radius || 50;

navigator.geolocation.getCurrentPosition(async pos => {
const dist = getDistance(pos.coords.latitude,pos.coords.longitude,cls.lat,cls.lon);
if(dist > radius) return alert("You are not within the geofence.");

const date = todayDate();  
await db.collection("attendance").doc(qrData.classId)  
  .collection(date).doc(currentUser.uid).set({  
    status: "present",  
    markedAt: firebase.firestore.Timestamp.now(),  
    locationVerified: true,  
    qrVerified: true,  
    approved: false  
  });  

alert("Attendance marked successfully!");  
logAudit("ATTENDANCE_MARKED");

}, err => alert("Unable to get location."));
}

// ===== ATTENDANCE PREDICTION =====
async function getPrediction() {
const classesSnap = await db.collection("classes")
.where("department","==",currentUser.department)
.where("year","==",currentUser.year)
.get();

let total = 0, present = 0;
const date = todayDate();

for(const cls of classesSnap.docs){
const attSnap = await db.collection("attendance").doc(cls.id)
.collection(date).get();
total += attSnap.size;
present += attSnap.docs.filter(d=>d.data().status==="present").length;
}

const percent = total ? Math.round((present/total)*100) : 0;
const riskLevel = percent < 50 ? "HIGH" : percent < 75 ? "MEDIUM" : "LOW";

await db.collection("predictions").doc(currentUser.uid).set({
attendancePercentage: percent,
riskLevel,
updatedAt: firebase.firestore.Timestamp.now()
});

alert(Your attendance is ${percent}%. Prediction: ${riskLevel});
}

// ===== CORRECTIONS =====
async function requestCorrection() {
const clsId = prompt("Enter Class ID to request correction:");
const reason = prompt("Enter reason:") || "";
if(!clsId) return;

await db.collection("corrections").add({
studentId: currentUser.uid,
classId: clsId,
date: todayDate(),
reason,
status: "pending",
requestedAt: firebase.firestore.Timestamp.now(),
reviewedBy: ""
});
alert("Correction requested!");
logAudit("CORRECTION_REQUESTED");
}

async function loadCorrections() {
const box = document.getElementById("correction-requests");
const snap = await db.collection("corrections")
.where("status","==","pending").get();
box.innerHTML = "";
snap.forEach(d=>{
const data = d.data();
box.innerHTML += <p>   Student: ${data.studentId} | Class: ${data.classId}   <button onclick="approveCorrection('${d.id}')">Approve</button>   </p>;
});
}

async function approveCorrection(correctionId){
await db.collection("corrections").doc(correctionId).update({
status:"approved",
reviewedBy: currentUser.uid
});
logAudit("CORRECTION_APPROVED");
loadCorrections();
}
