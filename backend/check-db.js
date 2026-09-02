const mongoose = require('mongoose');

// Local MongoDB Connection String
const MONGODB_URI = "mongodb://127.0.0.1:27017/printsta";

const studentSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  registerNumber: String,
});

const Student = mongoose.model('Student', studentSchema);

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");
    const students = await Student.find({});
    console.log("Registered students count:", students.length);
    students.forEach(s => {
      console.log(`Name: ${s.firstName} ${s.lastName} | Email: ${s.email} | RegNo: ${s.registerNumber}`);
    });
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
