const mongoose = require('mongoose');

// Use environment variable or default Atlas URI from project
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://kavingsln_db_user:wV3LQjV2i2uAiwDo@cluster1.3mlizdb.mongodb.net/printsta?appName=Cluster1";

console.log("Connecting to MongoDB Atlas...");

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log("Successfully connected!");
    
    // Explicitly target the collections used in Printsta
    const collectionsToClear = ['students', 'printorders'];
    
    for (const colName of collectionsToClear) {
      console.log(`Clearing all documents in collection: "${colName}"...`);
      try {
        const result = await mongoose.connection.db.collection(colName).deleteMany({});
        console.log(`Collection "${colName}" cleared. Deleted ${result.deletedCount} documents.`);
      } catch (err) {
        console.log(`Collection "${colName}" could not be cleared (it may not exist yet: ${err.message})`);
      }
    }
    
    console.log("\n========================================");
    console.log("  SUCCESS: Database tables cleared!");
    console.log("========================================");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error connecting to database:", err.message);
    process.exit(1);
  });
