const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = "mongodb+srv://kavingsln_db_user:2MESA10OUXkDOBBv@cluster1.3mlizdb.mongodb.net/printsta?appName=Cluster1";

const studentSchema = new mongoose.Schema({
  email: String,
  registerNumber: String,
  password: { type: String, required: true }
});

const Student = mongoose.model('Student', studentSchema);

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");

    const student = await Student.findOne({ email: "kavin.gs2025ece@sece.ac.in" });
    if (student) {
      console.log("Found student:", student.email);
      console.log("Password hash:", student.password);
      // Let's test checking some common passwords
      const common = ["12345678", "kavin@123", "sece@print", "password", "kavin123"];
      for (const p of common) {
        const ok = await bcrypt.compare(p, student.password);
        if (ok) console.log(`Password matches: "${p}"`);
      }
    } else {
      console.log("Student not found");
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
