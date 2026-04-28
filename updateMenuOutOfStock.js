
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const staticMenuItems = [
  { id: 's1', name: 'Paneer Tikka', category: 'Starters', price: 250, description: 'Grilled cottage cheese cubes marinated in spices.', imageUrl: '/assets/paneer_tikka.png' },
  { id: 's2', name: 'Chicken 65', category: 'Starters', price: 300, description: 'Spicy, deep-fried chicken bites.', imageUrl: '/assets/chicken_65.png' },
  { id: 's3', name: 'Spring Rolls', category: 'Starters', price: 180, description: 'Crispy rolls stuffed with seasoned vegetables.', imageUrl: '/assets/spring_rolls.png' },
  { id: 's4', name: 'Mushroom Salt & Pepper', category: 'Starters', price: 220, description: 'Crispy fried mushrooms tossed with salt and pepper.', imageUrl: '/assets/mushroom_salt_pepper.png' },
  { id: 'm1', name: 'Butter Chicken', category: 'Main Course', price: 450, description: 'Tender chicken simmered in a creamy tomato gravy.', imageUrl: '/assets/butter_chicken.png' },
  { id: 'm2', name: 'Dal Makhani', category: 'Main Course', price: 350, description: 'Slow-cooked black lentils with butter and cream.', imageUrl: '/assets/dal_makhani.png' },
  { id: 'm3', name: 'Mutton Biryani', category: 'Main Course', price: 550, description: 'Aromatic basmati rice cooked with tender mutton and spices.', imageUrl: '/assets/mutton_biryani.png' },
  { id: 'm4', name: 'Palak Paneer', category: 'Main Course', price: 380, description: 'Cottage cheese cubes in a thick paste made from purǸed spinach.', imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&q=80&w=500' },
  { id: 'd1', name: 'Mango Lassi', category: 'Drinks', price: 120, description: 'Refreshing yogurt-based mango drink.', imageUrl: 'https://images.unsplash.com/photo-1570197782352-25de0b2bcf1b?auto=format&fit=crop&q=80&w=500' },
  { id: 'd2', name: 'Cold Coffee', category: 'Drinks', price: 150, description: 'Chilled coffee blended with vanilla ice cream.', imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=500' },
  { id: 'd3', name: 'Fresh Lime Soda', category: 'Drinks', price: 90, description: 'Sparkling water with fresh lime juice.', imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=500' },
  { id: 'd4', name: 'Masala Chai', category: 'Drinks', price: 60, description: 'Spiced Indian tea brewed with milk.', imageUrl: 'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&q=80&w=500' },
];

async function migrateMenu() {
  console.log("Starting menu migration...");
  try {
    const menuRef = collection(db, "menu");
    const snapshot = await getDocs(menuRef);
    let updatedCount = 0;

    // Seed data if empty
    if (snapshot.empty) {
      console.log("Menu collection is empty. Seeding initial data...");
      for (const item of staticMenuItems) {
        const docRef = doc(db, 'menu', item.id);
        const data = { ...item };
        delete data.id; // Store id as docId, not field or optionally both
        data.outOfStock = false;
        
        await setDoc(docRef, data);
        updatedCount++;
      }
      console.log(`Seeded ${updatedCount} initial menu items.`);
    } else {
      for (const document of snapshot.docs) {
        const data = document.data();
        if (data.outOfStock === undefined) {
          await updateDoc(doc(db, "menu", document.id), {
            outOfStock: false
          });
          updatedCount++;
          console.log(`Updated document: ${document.id}`);
        }
      }
      console.log(`Migration complete. Updated ${updatedCount} documents.`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrateMenu();
