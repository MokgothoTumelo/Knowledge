/* ============================================================
   Knowledge – authentication (DEMO ONLY)
   ------------------------------------------------------------
   Accounts live in this browser's localStorage. This makes the
   login flow work for design/prototype purposes, but it is NOT
   secure: anyone with dev tools can read or bypass it. Before
   real launch, replace signUp/signIn/signOut with calls to a
   server (or Firebase / Supabase) and serve PDFs only to
   authenticated requests.
   ============================================================ */

(function () {
  const USERS_KEY = "knowledge_users";
  const SESSION_KEY = "knowledge_session";
  const WELCOME_KEY = "knowledge_welcome";

  /* ---------- storage helpers ---------- */
  function read(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(store, key, value) {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage write failed", e);
    }
  }
  const getUsers = () => read(localStorage, USERS_KEY, []);

  /* ---------- password hashing (demo-grade) ---------- */
  async function hashPassword(password, salt) {
    const text = salt + ":" + password;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(text))); // fallback when SubtleCrypto is unavailable
  }
  function makeSalt() {
    const a = new Uint8Array(12);
    (window.crypto || { getRandomValues: (x) => x.map(() => Math.random() * 256) }).getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- session ---------- */
  function getUser() {
    const email = read(sessionStorage, SESSION_KEY, null) || read(localStorage, SESSION_KEY, null);
    if (!email) return null;
    const u = getUsers().find((x) => x.email === email);
    return u ? { name: u.name, email: u.email } : null;
  }

  function startSession(email, remember) {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    write(remember ? localStorage : sessionStorage, SESSION_KEY, email);
  }

  async function signUp(name, email, password) {
    email = email.trim().toLowerCase();
    const users = getUsers();
    if (users.some((u) => u.email === email)) {
      return { ok: false, field: "email", message: "An account with this email already exists. Sign in instead." };
    }
    const salt = makeSalt();
    users.push({ name: name.trim(), email, salt, hash: await hashPassword(password, salt), createdAt: Date.now() });
    write(localStorage, USERS_KEY, users);
    startSession(email, true);
    return { ok: true };
  }

  async function signIn(email, password, remember) {
    email = email.trim().toLowerCase();
    const user = getUsers().find((u) => u.email === email);
    if (!user) {
      return { ok: false, field: "email", message: "No account found for this email. Create an account to get started." };
    }
    if ((await hashPassword(password, user.salt)) !== user.hash) {
      return { ok: false, field: "password", message: "That password is incorrect. Try again." };
    }
    startSession(email, remember);
    return { ok: true };
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  /* ---------- redirect helpers ---------- */
  function currentPage() {
    const file = location.pathname.split("/").pop() || "index.html";
    return file + location.hash;
  }
  // Only allow simple same-folder page links such as "papers.html#ds-2023"
  function safeNext(value) {
    return /^[\w-]+\.html(#[\w-]*)?$/.test(value || "") ? value : "index.html";
  }
  function loginUrl(params) {
    const q = new URLSearchParams(params);
    return "login.html?" + q.toString();
  }

  /* ---------- the gate ---------- */
  // Sends a guest to the login page. Returns true if the user may continue.
  function require(action, item) {
    if (getUser()) return true;
    const page = currentPage();
    let next = page;
    if (item && item.id) {
      const file = item.type === "book" ? "books.html" : item.type === "paper" ? "papers.html" : page.split("#")[0];
      next = file + "#" + item.id;
    }
    location.href = loginUrl({ next: next, action: action, title: item ? item.title : "" });
    return false;
  }

  window.Auth = { getUser, signUp, signIn, signOut, require, safeNext, loginUrl, startSession };

  /* ---------- toast (works on pages without script.js) ---------- */
  function notify(message) {
    if (typeof showToast === "function") return showToast(message);
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }
  window.notify = notify;

  /* ---------- top bar ---------- */
  function initials(name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderAuthArea() {
    const host = document.getElementById("authArea");
    const user = getUser();
    document.body.classList.toggle("is-guest", !user);
    if (!host) return;

    if (user) {
      host.innerHTML =
        '<div class="avatar" title="' + esc(user.email) + '">' + esc(initials(user.name)) + "</div>" +
        '<span class="hello">Hi,<br><strong>' + esc(user.name.split(/\s+/)[0]) + "</strong></span>" +
        '<button type="button" class="logout-btn" id="logoutBtn" title="Log out" aria-label="Log out"><i data-lucide="log-out"></i></button>';
      document.getElementById("logoutBtn").addEventListener("click", function () {
        signOut();
        renderAuthArea();
        notify("You have been signed out");
        // Leaving a page that only makes sense signed in is not needed; browsing stays open.
      });
    } else {
      const here = currentPage();
      host.innerHTML =
        '<a class="auth-link" href="' + loginUrl({ next: here }) + '">Sign in</a>' +
        '<a class="primary auth-signup" href="' + loginUrl({ mode: "signup", next: here }) + '">Sign up</a>';
    }
    if (window.lucide) lucide.createIcons();
  }

  /* ---------- intercept view / download / read / watch for guests ---------- */
  const GATED = [
    { sel: ".btn-view, #modalView", action: "view", type: "paper" },
    { sel: ".btn-read, #modalRead", action: "read", type: "book" },
    { sel: ".btn-download, #modalDownload", action: "download" },
    { sel: ".paper-list button", action: "download", type: "paper" },
    { sel: ".book-list button", action: "download", type: "book" },
  ];

  function itemFromClick(el, type) {
    // 1. the card / button carries a data-id
    const holder = el.closest("[data-id]");
    if (holder && typeof findContent === "function") {
      const found = findContent(holder.dataset.id);
      if (found) return found;
    }
    // 2. a modal is open: match its title
    const modalTitle = document.getElementById("modalTitle");
    if (modalTitle && typeof ALL_CONTENT !== "undefined") {
      const t = modalTitle.textContent.trim();
      const found = ALL_CONTENT.find((c) => c.title === t);
      if (found) return found;
    }
    // 3. home page lists: match by the visible title
    const li = el.closest("li");
    if (li && typeof ALL_CONTENT !== "undefined") {
      const strong = li.querySelector("strong");
      const label = strong ? strong.textContent.replace(/\s+/g, " ").trim().replace(/[–-]/g, "-") : "";
      const found = ALL_CONTENT.find(
        (c) => (!type || c.type === type) && c.title.replace(/\s+/g, " ").replace(/[–-]/g, "-") === label
      );
      if (found) return found;
    }
    return null;
  }

  document.addEventListener(
    "click",
    function (e) {
      if (getUser()) return;
      for (const rule of GATED) {
        const hit = e.target.closest(rule.sel);
        if (!hit) continue;
        e.preventDefault();
        e.stopImmediatePropagation();
        require(rule.action, itemFromClick(hit, rule.type));
        return;
      }
    },
    true
  );

  /* ---------- run ---------- */
  renderAuthArea();

  const welcome = read(sessionStorage, WELCOME_KEY, null);
  if (welcome && getUser()) {
    sessionStorage.removeItem(WELCOME_KEY);
    setTimeout(() => notify(welcome), 400);
  }
  window.Auth.setWelcome = (msg) => write(sessionStorage, WELCOME_KEY, msg);
})();
