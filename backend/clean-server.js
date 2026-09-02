const fs = require('fs');
const path = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/backend/server.js';
let content = fs.readFileSync(path, 'utf8');

// If server.js contains duplicated header starting from line 590, clean it up first
const dupIndex = content.indexOf('/**\n * Printsta - Full Stack');
if (dupIndex > 0) {
  content = content.substring(dupIndex);
  console.log("Trimmed duplicated header at start");
}

// Now replace student login and unified login cleanly
const studentLoginCode = `// Student Login
app.post('/auth/student/login', async (req, res) => {
  try {
    const { email, identifier, password } = req.body;
    const userIdentifier = (identifier || email || '').trim();
    if (!userIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }
    const idLower = userIdentifier.toLowerCase();

    let student = null;
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: userIdentifier }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }

    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, student.password);
    if (!validPassword) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: student._id, name: \`\${student.firstName} \${student.lastName}\`, email: student.email, role: 'student' },
      STUDENT_JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({ success: true, token, role: 'student', name: \`\${student.firstName} \${student.lastName}\`, studentName: \`\${student.firstName} \${student.lastName}\`, redirectTo: '/student.html' });
  } catch (error) {
    console.error("Student Login Error:", error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});`;

const unifiedLoginCode = `// ── UNIFIED LOGIN ─────────────────────────────────────────────────────────────
// POST /auth/login — detects role from identifier (email / registerNumber → student, username → staff/admin)
app.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const INVALID = 'Invalid credentials.';
    const idTrimmed = identifier.trim();
    const idLower = idTrimmed.toLowerCase();

    // 1. Check Student first (by Email OR Register Number)
    let student = null;
    if (dbConnected) {
      student = await Student.findOne({
        $or: [
          { email: idLower },
          { registerNumber: idTrimmed }
        ]
      });
    } else {
      student = inMemoryStudents.find(s =>
        (s.email && s.email.toLowerCase() === idLower) ||
        (s.registerNumber && s.registerNumber.toLowerCase() === idLower)
      );
    }

    if (student) {
      const valid = await bcrypt.compare(password, student.password);
      if (valid) {
        const token = jwt.sign(
          { id: student._id, name: \`\${student.firstName} \${student.lastName}\`, email: student.email, role: 'student' },
          STUDENT_JWT_SECRET, { expiresIn: '7d' }
        );
        return res.status(200).json({
          success: true, token, role: 'student',
          name: \`\${student.firstName} \${student.lastName}\`,
          studentName: \`\${student.firstName} \${student.lastName}\`,
          redirectTo: '/student.html'
        });
      }
    }

    // 2. Admin check (hardcoded credentials from .env)
    if (idTrimmed === ADMIN_USERNAME_ENV && password === ADMIN_PASSWORD_ENV) {
      const token = jwt.sign(
        { id: 'admin', username: ADMIN_USERNAME_ENV, name: 'Admin', role: 'admin' },
        ADMIN_JWT_SECRET, { expiresIn: '7d' }
      );
      return res.status(200).json({
        success: true, token, role: 'admin', name: 'Admin', redirectTo: '/admin.html'
      });
    }

    // 3. Staff check
    let staff = null;
    if (dbConnected) {
      staff = await Staff.findOne({ username: idTrimmed });
    } else {
      staff = inMemoryStaff.find(s => s.username === idTrimmed);
    }
    if (staff) {
      const validStaff = await bcrypt.compare(password, staff.passwordHash);
      if (validStaff) {
        const token = jwt.sign(
          { id: staff._id || staff.id, username: staff.username, name: staff.name, role: 'staff' },
          STAFF_JWT_SECRET, { expiresIn: '7d' }
        );
        return res.status(200).json({
          success: true, token, role: 'staff', name: staff.name, redirectTo: '/staff.html'
        });
      }
    }

    return res.status(401).json({ success: false, message: INVALID });
  } catch (error) {
    console.error('Unified Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});`;

// Find `/auth/student/login` block in server.js and replace it
const studentLoginRegex = /\/\/ Student Login[\s\S]*?\}\);\n\n\/\/ ── UNIFIED LOGIN/m;
if (studentLoginRegex.test(content)) {
  content = content.replace(studentLoginRegex, studentLoginCode + '\n\n// ── UNIFIED LOGIN');
  console.log("Replaced Student Login regex");
}

// Find `/auth/login` block in server.js and replace it
const unifiedLoginRegex = /\/\/ ── UNIFIED LOGIN[\s\S]*?\}\);\n\n\/\/ Backwards-compat/m;
if (unifiedLoginRegex.test(content)) {
  content = content.replace(unifiedLoginRegex, unifiedLoginCode + '\n\n// Backwards-compat');
  console.log("Replaced Unified Login regex");
}

fs.writeFileSync(path, content);
console.log("Cleaned server.js");
