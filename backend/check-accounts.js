const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/printsta').then(async () => {
  const Student = mongoose.model('Student', new mongoose.Schema({
    firstName: String, lastName: String, email: String, registerNumber: String
  }));
  const Staff = mongoose.model('Staff', new mongoose.Schema({
    username: String, name: String
  }));

  const students = await Student.find({}, { firstName:1, lastName:1, email:1, registerNumber:1, _id:0 });
  const staffs = await Staff.find({}, { username:1, name:1, _id:0 });

  console.log('\n=== STUDENTS ===');
  if (students.length === 0) console.log('No students registered yet.');
  students.forEach(s => console.log(`Name: ${s.firstName} ${s.lastName} | Email: ${s.email} | Reg: ${s.registerNumber}`));

  console.log('\n=== STAFF ===');
  if (staffs.length === 0) console.log('No staff registered yet.');
  staffs.forEach(s => console.log(`Username: ${s.username} | Name: ${s.name}`));

  console.log('\n(Passwords are encrypted and cannot be displayed)');
  mongoose.disconnect();
}).catch(err => {
  console.log('MongoDB connection failed:', err.message);
  process.exit(1);
});
