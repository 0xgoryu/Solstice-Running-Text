# What do you think about Solstice?

A single-page feedback wall. Visitors sign in with their **X (Twitter) account**, then post one short take that scrolls across a five-row marquee feed. One submission per X account, capped at 200 active takes, stored in Firebase.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup only |
| `style.css` | All styling |
| `script.js` | UI behavior (auth state, inputs, marquee rendering) |
| `firebase.js` | Firebase init + Twitter Auth + Firestore read/write |
| `firebase-config.example.js` | Template for your Firebase credentials |
| `README.md` | This file |

---

## Setup

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. Go to **Build → Firestore Database → Create database**. Start in production mode.
3. Go to **Project settings → General → Your apps**, click **</>** (web), register an app.
4. Copy the `firebaseConfig` object.

### 2. Add your config

```bash
cp firebase-config.example.js firebase-config.js
```

Paste your Firebase values into `firebase-config.js`.

### 3. Enable Twitter/X Authentication

1. Go to **Firebase Console → Authentication → Sign-in method**.
2. Click **Twitter** → toggle **Enable**.
3. You'll need a **Twitter API Key** and **API Secret** — get these from [developer.twitter.com](https://developer.twitter.com):
   - Create a new project/app.
   - Under **App settings → User authentication settings**, enable OAuth 1.0a (for Firebase) or OAuth 2.0.
   - Set **Callback URL** to the one shown in Firebase (looks like `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`).
   - Copy the **API Key** and **API Secret Key**.
4. Paste them into Firebase's Twitter sign-in config → Save.

### 4. Set Firestore security rules

In **Firestore Database → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /takes/{uid} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 200
                    && !exists(/databases/$(database)/documents/takes/$(uid));
      allow update, delete: if false;
    }
  }
}
```

This enforces one take per Twitter UID at the server level — not just client-side.

### 5. Run locally

ES modules don't work from `file://`. Serve over localhost:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

> **Note:** Twitter OAuth requires a real domain for the callback, so the popup will fail on plain `localhost`. Use a tunnel like [ngrok](https://ngrok.com) for local testing, or just deploy to Vercel directly.

### 6. Deploy to Vercel

Push the project to GitHub (including `firebase-config.js`), then:
1. **New Project** → import the repo.
2. Framework preset: **Other** (plain static site, no build step).
3. Leave build command empty, output directory as repo root.
4. Deploy.

Make sure to add your **Vercel domain** (e.g. `your-app.vercel.app`) to:
- Twitter Developer App → **Callback URLs** / **Website URL**
- Firebase Console → **Authentication → Authorized domains**

---

## 🗑️ Cara hapus data tester dari Firebase Console

Ikuti langkah ini untuk mulai dari data bersih:

### Hapus semua dokumen di koleksi `takes`

1. Buka [console.firebase.google.com](https://console.firebase.google.com)
2. Pilih project kamu → **Firestore Database**
3. Di panel kiri, klik koleksi **`takes`**
4. Klik titik tiga **⋮** di sebelah nama koleksi `takes`
5. Pilih **"Delete collection"**
6. Ketik `takes` untuk konfirmasi → klik **Delete**

✅ Selesai. Koleksi akan terbuat ulang otomatis saat ada take baru masuk.

### Hapus akun tester di Authentication (opsional)

Kalau kamu juga mau hapus login tester:

1. Di Firebase Console → **Authentication → Users**
2. Pilih user yang mau dihapus → klik ikon tempat sampah 🗑️
3. Atau klik **Delete all users** kalau mau hapus semua sekaligus

---

## Catatan: kenapa Twitter UID, bukan username?

Username Twitter bisa diganti orang. Menggunakan UID (yang permanen) sebagai document ID memastikan satu akun Twitter = satu take, meskipun mereka ganti handle setelah posting.
