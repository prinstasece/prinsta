const fs = require('fs');
const serverPath = 'c:/Users/KAVIN GS/OneDrive/Desktop/printnsta project/backend/server.js';
let content = fs.readFileSync(serverPath, 'utf8');

// 1. Update /auth/student/login route
const oldStudentLogin = `app.post('/auth/student/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let student = null;

    if (dbConnected) {
      student = await Student.findOne({ email });
    } else {
      console.log(\`[Offline Mode] Student login attempt: \${email}\`);
      student = inMemoryStudents.find(s => s.email === email);
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

const newStudentLogin = `app.post('/auth/student/login', async (req, res) => {
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
          { registerNumber: { $regex: new RegExp(\`^\${userIdentifier}$\`, 'i') } }
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

if (content.includes(oldStudentLogin)) {
  content = content.replace(oldStudentLogin, newStudentLogin);
  console.log("Replaced /auth/student/login");
} else {
  console.warn("Could not find exact oldStudentLogin block, attempting regex replace");
}

// 2. Update /auth/login route
const oldUnifiedLogin = `app.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const INVALID = 'Invalid credentials.';

    // If identifier contains '@' → student email flow
    if (identifier.includes('@')) {
      let student = null;
      if (dbConnected) {
        student = await Student.findOne({ email: identifier.toLowerCase().trim() });
      } else {
        student = inMemoryStudents.find(s => s.email === identifier.toLowerCase().trim());
      }
      if (!student) return res.status(401).json({ success: false, message: INVALID });
      const valid = await bcrypt.compare(password, student.password);
      if (!valid) return res.status(401).json({ success: false, message: INVALID });

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

    // Username flow — check Admin first, then Staff
    const uname = identifier.trim();

    // Admin check (hardcoded credentials from .env)
    if (uname === ADMIN_USERNAME_ENV && password === ADMIN_PASSWORD_ENV) {
      const token = jwt.sign(
        { id: 'admin', username: ADMIN_USERNAME_ENV, name: 'Admin', role: 'admin' },
        ADMIN_JWT_SECRET, { expiresIn: '7d' }
      );
      return res.status(200).json({
        success: true, token, role: 'admin', name: 'Admin', redirectTo: '/admin.html'
      });
    }

    // Staff check
    let staff = null;
    if (dbConnected) {
      staff = await Staff.findOne({ username: uname });
    } else {
      staff = inMemoryStaff.find(s => s.username === uname);
    }
    if (!staff) return res.status(401).json({ success: false, message: INVALID });
    const validStaff = await bcrypt.compare(password, staff.passwordHash);
    if (!validStaff) return res.status(401).json({ success: false, message: INVALID });

    const token = jwt.sign(
      { id: staff._id || staff.id, username: staff.username, name: staff.name, role: 'staff' },
      STAFF_JWT_SECRET, { expiresIn: '7d' }
    );
    return res.status(200).json({
      success: true, token, role: 'staff', name: staff.name, redirectTo: '/staff.html'
    });

  } catch (error) {
    console.error('Unified Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server processing error.' });
  }
});`;

const newUnifiedLogin = `app.post('/auth/login', async (req, res) => {
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
          { registerNumber: { $regex: new RegExp(\`^\${idTrimmed}$\`, 'i') } }
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

if (content.includes(oldUnifiedLogin)) {
  content = content.replace(oldUnifiedLogin, newUnifiedLogin);
  console.log("Replaced /auth/login");
}

fs.writeFileSync(serverPath, content);
console.log("Server.js updated successfully.");
