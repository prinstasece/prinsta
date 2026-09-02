git stausconst mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGODB_URI;
console.log("Connecting to:", uri);

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 8000
})
  .then(async () => {
    console.log("Connected successfully!");
    const db = mongoose.connection.db;
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log("Collections in current database:");
    for (let col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(` - ${col.name}: ${count} documents`);
    }
    
    // Check other databases on the cluster
    const admin = db.admin();
    try {
      const dbs = await admin.listDatabases();
      console.log("\nAll Databases in cluster:");
      for (let d of dbs.databases) {
        console.log(` - ${d.name} (${d.sizeOnDisk} bytes)`);
      }
    } catch(e) {
      console.log("Could not list databases:", e.message);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error("Connection failed:", err.message);
    process.exit(1);
  });
