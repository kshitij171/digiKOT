import fs from 'fs';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Read from .env manually to avoid extra 'dotenv' installation
const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = envContent.split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key) acc[key] = value;
    }
    return acc;
}, {});

const firebaseConfig = {
    apiKey: envVars.VITE_FIREBASE_API_KEY,
    authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: envVars.VITE_FIREBASE_DATABASE_URL,
    projectId: envVars.VITE_FIREBASE_PROJECT_ID,
    storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envVars.VITE_FIREBASE_APP_ID,
    measurementId: envVars.VITE_FIREBASE_MEASUREMENT_ID
};

console.log("Initializing Firebase connection...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedTables() {
    console.log("Starting to seed the /tables collection...");
    try {
        for (let i = 1; i <= 10; i++) {
            // Using sequential Table IDs, e.g., T1, T2, ... T10
            const tableId = `T${i}`;
            const tableRef = doc(db, 'tables', tableId);
            
            // Setting exact document structure requested
            await setDoc(tableRef, {
                tableId: tableId,
                status: 'available',      // "available" | "occupied"
                currentSessionId: null  // string or null
            });
            console.log(`✅ Created Table: ${tableId}`);
        }
        console.log("🎉 Successfully seeded 10 tables! Exiting...");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding the tables:", error);
        process.exit(1);
    }
}

seedTables();
