const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://kavingsln_db_user:wV3LQjV2i2uAiwDo@cluster1.3mlizdb.mongodb.net/printsta?appName=Cluster1";

console.log("Attempting to connect to MongoDB Atlas...");

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000 // fail fast in 5 seconds
})
.then(() => {
  console.log("SUCCESS: Connected to database successfully!");
  process.exit(0);
})
.catch(err => {
  console.error("FAILURE: Connection error occurred:");
  console.error("Error Name:", err.name);
  console.error("Error Message:", err.message);
  console.error("Error Code:", err.code);
  console.error("Full Error Object:", JSON.stringify(err, null, 2));
  process.exit(1);
});
