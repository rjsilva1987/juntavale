import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
// @ts-ignore — getReactNativePersistence exists at runtime (Metro resolves
// firebase/auth to @firebase/auth's "react-native" build), but the shared
// .d.ts file doesn't declare it since types aren't platform-conditioned.
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDppWsUZxORO9Co7dP91DflBTmegyV82NY',
  authDomain: 'bbmatch-9ede5.firebaseapp.com',
  projectId: 'bbmatch-9ede5',
  storageBucket: 'bbmatch-9ede5.firebasestorage.app',
  messagingSenderId: '127211238955',
  appId: '1:127211238955:web:31d9ba9e4abdc52f74dc6e',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
