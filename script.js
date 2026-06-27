// UI logic only. All data persistence and auth goes through firebase.js.

import {
  signInWithTwitter,
  signOutUser,
  onAuthChange,
  hasUserSubmitted,
  submitTake,
  subscribeToTakes,
  MAX_ITEMS
} from "./firebase.js";

const ROW_COUNT = 5;
const DIRECTIONS = ["right", "left", "right", "left", "right"];

let state = {
  user: null,        // { uid, username, photoURL }
  hasPosted: false,
  items: []
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const connectXBtn  = document.getElementById("connectXBtn");
const userPill     = document.getElementById("userPill");
const userPfpImg   = document.getElementById("userPfpImg");
const userHandle   = document.getElementById("userHandle");
const signOutBtn   = document.getElementById("signOutBtn");
const textInput    = document.getElementById("textInput");
const submitBtn    = document.getElementById("submitBtn");
const charCount    = document.getElementById("charCount");
const statusLine   = document.getElementById("statusLine");
const feedPanel    = document.getElementById("feedPanel");

// ─── Auth events ─────────────────────────────────────────────────────────────

connectXBtn.addEventListener("click", async () => {
  connectXBtn.disabled = true;
  connectXBtn.textContent = "Connecting…";

  try {
    const { uid, username, photoURL, existingTake } = await signInWithTwitter();
    // onAuthChange will fire and update everything
  } catch (err) {
    console.error("Sign-in failed:", err);
    statusLine.textContent = "Couldn't connect to X. Try again.";
    connectXBtn.disabled = false;
    connectXBtn.innerHTML = `
      <svg class="x-logo" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.254 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
      </svg>
      Connect with X`;
  }
});

signOutBtn.addEventListener("click", async () => {
  await signOutUser();
  // onAuthChange fires with null → resets UI
});

// ─── Auth state listener ──────────────────────────────────────────────────────

onAuthChange(async (user) => {
  if (!user) {
    // Signed out
    state.user = null;
    state.hasPosted = false;

    connectXBtn.disabled = false;
    connectXBtn.innerHTML = `
      <svg class="x-logo" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.254 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
      </svg>
      Connect with X`;
    connectXBtn.style.display = "";
    userPill.style.display = "none";
    updateComposerState();
    return;
  }

  // Signed in — check if already posted
  state.user = user;
  state.hasPosted = !!user.existingTake;

  // Show user pill
  connectXBtn.style.display = "none";
  userPill.style.display = "";
  userHandle.textContent = "@" + user.username;
  if (user.photoURL) {
    userPfpImg.src = user.photoURL;
    userPfpImg.style.display = "";
  } else {
    userPfpImg.style.display = "none";
  }

  updateComposerState();
});

// ─── Composer ────────────────────────────────────────────────────────────────

function updateComposerState() {
  if (!state.user) {
    textInput.disabled = true;
    textInput.placeholder = "Connect with X to share your take…";
    submitBtn.disabled = true;
    statusLine.textContent = "";
    return;
  }
  if (state.hasPosted) {
    textInput.disabled = true;
    textInput.value = "";
    textInput.placeholder = "You already posted your take";
    submitBtn.disabled = true;
    statusLine.textContent = "You've already shared your take as @" + state.user.username + ".";
    return;
  }
  if (state.items.length >= MAX_ITEMS) {
    textInput.disabled = true;
    textInput.placeholder = "Feed is full — 200 takes reached";
    submitBtn.disabled = true;
    statusLine.textContent = "The feed has reached its 200 take limit.";
    return;
  }
  textInput.disabled = false;
  textInput.placeholder = "Share your take on Solstice…";
  submitBtn.disabled = textInput.value.trim().length === 0;
  statusLine.textContent = "";
}

textInput.addEventListener("input", () => {
  charCount.textContent = textInput.value.length + " / 200";
  submitBtn.disabled =
    !state.user || state.hasPosted || textInput.value.trim().length === 0;
});

submitBtn.addEventListener("click", async () => {
  const val = textInput.value.trim();
  if (!val || !state.user || state.hasPosted) return;
  if (state.items.length >= MAX_ITEMS) { updateComposerState(); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "Posting…";

  try {
    // Re-check right before writing to close the race window
    const alreadyPosted = await hasUserSubmitted(state.user.uid);
    if (alreadyPosted) {
      state.hasPosted = true;
      updateComposerState();
      return;
    }
    await submitTake(state.user.uid, state.user.username, val, state.user.photoURL);
    state.hasPosted = true;
    updateComposerState();
  } catch (err) {
    console.error("Could not submit take:", err);
    statusLine.textContent = "Couldn't post your take. Try again.";
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = "Post take";
  }
});

// ─── Marquee feed ─────────────────────────────────────────────────────────────

function buildChip(item) {
  const span = document.createElement("span");
  span.className = "chip";
  if (item.pfp) {
    const img = document.createElement("img");
    img.src = item.pfp;
    img.className = "chip-pfp";
    span.appendChild(img);
  }
  const handle = document.createElement("span");
  handle.className = "handle";
  handle.textContent = "@" + item.username;
  span.appendChild(handle);
  span.appendChild(document.createTextNode(" " + item.text));
  return span;
}

function distributeIntoRows(items) {
  const rows = Array.from({ length: ROW_COUNT }, () => []);
  items.forEach((item, i) => { rows[i % ROW_COUNT].push(item); });
  return rows;
}

function renderFeed() {
  feedPanel.innerHTML = "";
  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "feed-empty";
    empty.textContent = "No takes yet. Be the first.";
    feedPanel.appendChild(empty);
    return;
  }

  const rows = distributeIntoRows(state.items);
  rows.forEach((rowItems, idx) => {
    if (rowItems.length === 0) return;
    const rowEl = document.createElement("div");
    rowEl.className = "marquee-row";

    let base = rowItems.slice();
    while (base.length < 6) base = base.concat(rowItems);

    const track = document.createElement("div");
    track.className = "marquee-track " + DIRECTIONS[idx];

    for (let s = 0; s < 2; s++) {
      const setEl = document.createElement("div");
      setEl.className = "marquee-set";
      base.forEach(item => setEl.appendChild(buildChip(item)));
      track.appendChild(setEl);
    }

    rowEl.appendChild(track);
    feedPanel.appendChild(rowEl);
  });
}

subscribeToTakes((items) => {
  state.items = items;
  renderFeed();
  updateComposerState();
});

updateComposerState();
