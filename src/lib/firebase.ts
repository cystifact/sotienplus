import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, setPersistence, Auth } from 'firebase/auth';
import { firebaseConfig } from './firebase-config';

let app: FirebaseApp;
let auth: Auth;

if (firebaseConfig.apiKey) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  // Use IndexedDB persistence explicitly for reliable PWA auth state
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    // Fallback: browser will use default persistence
  });
} else {
  // Build time — Firebase config not available
  app = {} as FirebaseApp;
  auth = {} as Auth;
}

export { app, auth };
