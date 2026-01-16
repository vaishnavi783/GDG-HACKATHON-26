// ===================== DEMO USERS =====================
const demoUsers = {
    'student@college.edu': {
        password: 'student123',
        role: 'student',
        name: 'DIYA KRISHNA Student',
        id: 'S2023001',
        department: 'DSP',
        semester: '5th'
    },
    'teacher@college.edu': {
        password: 'teacher123',
        role: 'teacher',
        name: 'Dr. ANITHA S',
        id: 'T2023001',
        department: 'DSP',
        designation: 'Professor'
    }
};

let currentUser = null;

// ===================== DEMO DATA =====================
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

const demoClasses = {
    1: ['Mathematics (9:00 AM - Room 101)', 'Physics (11:00 AM - Lab 3)', 'Computer Science (2:00 PM - Room 205)'],
    2: ['Chemistry (10:00 AM - Lab 1)', 'Biology (1:00 PM - Room 103)', 'English (3:00 PM - Room 104)'],
    3: ['Mathematics (9:00 AM - Room 101)', 'Physics Lab (11:00 AM - Lab 3)', 'Programming (2:00 PM - Lab 2)'],
    4: ['Data Structures (10:00 AM - Room 205)', 'Chemistry Lab (2:00 PM - Lab 1)'],
    5: ['Project Work (9:00 AM - All Day)', 'Seminar (3:00 PM - Auditorium)'],
    6: ['No Regular Classes - Self Study'],
    0: ['Weekend - No Classes']
};

const demoAttendance = {
    'student@college.edu': {
        totalClasses: 45,
        presentCount: 38,
        attendanceHistory: [
            { date: '2024-01-15', subject: 'Mathematics', status: 'Present' },
            { date: '2024-01-16', subject: 'Physics', status: 'Present' },
            { date: '2024-01-17', subject: 'Computer Science', status: 'Absent' },
            { date: '2024-01-18', subject: 'Chemistry', status: 'Present' },
            { date: '2024-01-19', subject: 'English', status: 'Present' }
        ]
    }
};

// ===================== PROJECT WORK =====================
let projectWorkSubmissions = {}; // store submissions in-memory

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    displayRandomQuote();
    
    const savedUser = localStorage.getItem('smartAttendUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }
});

// ===================== LOGIN =====================
function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    
    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    const errorElement = document.getElementById('login-error');
    
    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }
    
    if (!email.endsWith('@college.edu')) {
        showError('Please use a valid college email (@college.edu)');
        return;
    }
    
    spinner.style.display = 'block';
    loginBtn.disabled = true;
    errorElement.style.display = 'none';
    
    setTimeout(() => {
        if (demoUsers[email]) {
            const user = demoUsers[email];
            if (user.password === password && user.role === role) {
                currentUser = {
                    email: email,
                    role: user.role,
                    name: user.name,
                    id: user.id,
                    department: user.department,
                    ...(user.role === 'student' ? { semester: user.semester } : { designation: user.designation })
                };
                
                localStorage.setItem('smartAttendUser', JSON.stringify(currentUser));
                
                loginBtn.innerHTML = '✓ Login Successful!';
                loginBtn.style.backgroundColor = '#2ecc71';
                
                setTimeout(() => { showDashboard(); }, 1000);
                return;
            }
        }
        showError('Invalid credentials. Use demo accounts:<br>Student: student@college.edu / student123<br>Teacher: teacher@college.edu / teacher123');
    }, 1500);
}

function showError(message) {
    const errorElement = document.getElementById('login-error');
    const spinner = document.getElementById('login-spinner');
    const loginBtn = document.querySelector('.login-card button');
    
    spinner.style.display = 'none';
    loginBtn.disabled = false;
    errorElement.innerHTML = message;
    errorElement.style.display = 'block';
    
    loginBtn.innerHTML = 'Login';
    loginBtn.style.backgroundColor = '';
}

// ===================== LOGOUT =====================
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        localStorage.removeItem('smartAttendUser');
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        document.getElementById
