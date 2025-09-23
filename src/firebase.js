// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v9-compat and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCvlrUyIStJRdw1LUq_FDqYqDdZn9ao1os",
  authDomain: "focms-sas-elections-2k25.firebaseapp.com",
  projectId: "focms-sas-elections-2k25",
  storageBucket: "focms-sas-elections-2k25.firebasestorage.app",
  messagingSenderId: "388845860276",
  appId: "1:388845860276:web:c9bb6a7219ae2ecc21aee1"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);

export default app;