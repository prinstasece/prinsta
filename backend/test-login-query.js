const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://kavingsln_db_user:2MESA10OUXkDOBBv@cluster1.3mlizdb.mongodb.net/printsta?appName=Cluster1";

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

    const idTrimmed = "722825106073";
    const idLower = idTrimmed.toLowerCase();

    const student = await Student.findOne({
      $or: [
        { email: idLower },
        { registerNumber: idTrimmed }
      ]
    });

    console.log("Found student by query:", student ? `${student.firstName} ${student.lastName}` : "null");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
