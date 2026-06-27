// Firebase initialization, Auth (Twitter/X), and Firestore data access.
// All Firebase-specific logic lives here so script.js never touches
// the Firebase SDK directly — it only calls the functions exported below.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  TwitterAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TAKES_COLLECTION = "takes";
export const MAX_ITEMS = 200;

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Opens a Twitter/X sign-in popup.
 * Returns { uid, username, displayName, photoURL } on success.
 * The username is the Twitter @handle (without the @).
 */
export async function signInWithTwitter() {
  const provider = new TwitterAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const credential = TwitterAuthProvider.credentialFromResult(result);
  const user = result.user;

  // Twitter username lives in the additional user info
  const additionalInfo = result._tokenResponse;
  // screenName is the Twitter @handle
  const screenName =
    additionalInfo?.screenName ||
    user.reloadUserInfo?.screenName ||
    user.displayName?.replace(/\s+/g, "").toLowerCase() ||
    user.uid.slice(0, 15);

  return {
    uid: user.uid,
    username: screenName,
    displayName: user.displayName,
    photoURL: user.photoURL
  };
}

/**
 * Signs the current user out.
 */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Subscribes to auth state changes.
 * Calls callback({ uid, username, photoURL } | null) whenever auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    // Re-read the stored username from Firestore (in case they already posted)
    const existing = await getUserTake(user.uid);
    callback({
      uid: user.uid,
      username: existing?.username || user.displayName,
      photoURL: user.photoURL,
      existingTake: existing || null
    });
  });
}

// ─── Firestore ───────────────────────────────────────────────────────────────

/**
 * Returns the take object for a given uid, or null if not found.
 */
export async function getUserTake(uid) {
  const ref = doc(db, TAKES_COLLECTION, uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Checks whether a uid has already submitted a take.
 */
export async function hasUserSubmitted(uid) {
  const take = await getUserTake(uid);
  return take !== null;
}

/**
 * Saves a new take. Uses the Twitter UID as the document ID so a second
 * write attempt for the same account is blocked by Firestore rules.
 *
 * Firestore caps each document at ~1MB. If the pfp data URL is too
 * large the take is saved without the photo rather than failing outright.
 */
const PFP_SAFE_BYTE_LIMIT = 700000;

export async function submitTake(uid, username, text, pfpDataUrl) {
  let safePfp = pfpDataUrl || null;
  if (safePfp && safePfp.length > PFP_SAFE_BYTE_LIMIT) {
    console.warn("Profile picture too large for Firestore, saving take without it.");
    safePfp = null;
  }

  const ref = doc(db, TAKES_COLLECTION, uid);
  await setDoc(ref, {
    uid,
    username,
    text,
    pfp: safePfp,
    createdAt: serverTimestamp()
  });
}

/**
 * Subscribes to the most recent takes (newest first, capped at MAX_ITEMS).
 * Calls onUpdate(items) every time the data changes.
 * Returns an unsubscribe function.
 */
export function subscribeToTakes(onUpdate) {
  const q = query(
    collection(db, TAKES_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(MAX_ITEMS)
  );

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        username: data.username,
        text: data.text,
        pfp: data.pfp || null
      };
    });
    onUpdate(items);
  });
}
