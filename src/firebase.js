import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { collection, doc, getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredConfigKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
]

const hasRequiredFirebaseConfig = requiredConfigKeys.every(
  (key) => Boolean(firebaseConfig[key]),
)

const firebaseApp = hasRequiredFirebaseConfig ? initializeApp(firebaseConfig) : null

export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const isFirestoreEnabled = Boolean(db)
export const recordsCollection = db ? collection(db, 'records') : null
export const winnerDocumentRef = db ? doc(db, 'raffle', 'winner') : null
