(function () {
  "use strict";
  const USERS_KEY = "knowledge_users";
  const DB_NAME = "knowledge_admin_resources";
  const DB_VERSION = 1;
  const STORE = "files";
  const RESOURCE_INDEX_KEY = "knowledge_admin_resource_index";
  const $ = (id) => document.getElementById(id);

  // Browser-only demo gate. A real authorization check must also run on the server.
  const signedInUser = window.Auth && Auth.getUser();
  if (!signedInUser) {
    location.replace("login.html?next=admin.html");
    return;
  }
  if (!Auth.isAdmin()) {
    Auth.setWelcome?.("Admin access is restricted to administrator accounts.");
    location.replace("index.html");
    return;
  }

  function readUsers() {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      return Array.isArray(users) ? users : [];
    } catch (_) { return []; }
  }
  function readResources() {
    try {
      const resources = JSON.parse(localStorage.getItem(RESOURCE_INDEX_KEY) || "[]");
      return Array.isArray(resources) ? resources : [];
    } catch (_) { return []; }
  }
  function writeResources(resources) {
    try { localStorage.setItem(RESOURCE_INDEX_KEY, JSON.stringify(resources)); return true; }
    catch (_) { return false; }
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      if (location.protocol === "file:") {
        return reject(new Error("This page was opened directly from a file. Open the hosted website or a local web address (localhost) before uploading resources."));
      }
      if (!window.indexedDB) return reject(new Error("File storage is unavailable in this browser."));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open file storage."));
    });
  }
  async function storeFile(resource, file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: resource.id, blob: file, name: file.name, type: file.type });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save this file.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("File storage is full.")); };
    });
  }
  async function getFile(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => { const result = request.result; db.close(); resolve(result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
  }
  function renderStudents() {
    const users = readUsers().slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const query = $("studentSearch").value.trim().toLowerCase();
    const filtered = users.filter((user) => (String(user.name || "") + " " + String(user.email || "")).toLowerCase().includes(query));
    $("studentTotal").textContent = String(users.length);
    $("studentsTable").innerHTML = filtered.map((user) => "<tr><td>" + escapeHtml(user.name || "Student") + "</td><td>" + escapeHtml(user.email) + "</td><td>" + (user.grade ? "Grade " + escapeHtml(user.grade) : "Not provided") + "</td><td>" + escapeHtml(Array.isArray(user.subjects) && user.subjects.length ? user.subjects.join(", ") : "Not provided") + "</td><td>" + formatDate(user.createdAt) + '</td><td><span class="account-badge">Registered</span></td></tr>').join("");
    $("studentsEmpty").hidden = users.length > 0;
    $("studentsNoMatch").hidden = users.length === 0 || filtered.length > 0;
  }
  function renderResources() {
    const all = readResources().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const grade = $("gradeFilter").value;
    const resources = grade === "all" ? all : all.filter((item) => item.grade === grade);
    $("resourceTotal").textContent = String(all.length);
    $("resourceList").innerHTML = resources.map((item) => '<article class="resource-card"><div class="resource-info"><span class="resource-file-icon"><i data-lucide="file-text"></i></span><div><h3>' + escapeHtml(item.title) + '</h3><p>Grade ' + escapeHtml(item.grade) + " · " + escapeHtml(item.subject || "All subjects") + " · " + escapeHtml(item.type) + " · " + escapeHtml(item.fileName) + " · " + escapeHtml(item.sizeLabel) + '</p></div></div><div class="resource-actions"><a href="#" data-download="' + escapeHtml(item.id) + '"><i data-lucide="download"></i> Download</a></div></article>').join("");
    $("resourcesEmpty").hidden = resources.length > 0;
    if (window.lucide) lucide.createIcons();
  }

  document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
  }));
  $("studentSearch").addEventListener("input", renderStudents);
  $("gradeFilter").addEventListener("change", renderResources);
  $("resourceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = $("resourceFile").files[0];
    if (!file) return;
    const button = form.querySelector("button[type=submit]");
    const message = $("uploadMessage");
    button.disabled = true;
    message.textContent = "Saving file…";
    const id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const resource = { id, title: $("resourceTitle").value.trim(), grade: $("resourceGrade").value, subject: $("resourceSubject").value, type: $("resourceType").value, fileName: file.name, sizeLabel: file.size < 1048576 ? Math.max(1, Math.round(file.size / 1024)) + " KB" : (file.size / 1048576).toFixed(1) + " MB", createdAt: Date.now() };
    try {
      await storeFile(resource, file);
      const resources = readResources();
      resources.push(resource);
      if (!writeResources(resources)) throw new Error("The browser could not save the resource details.");
      window.KnowledgeNotifications?.publishUpload(resource);
      form.reset();
      message.textContent = "Resource uploaded to this browser.";
      renderResources();
    } catch (error) {
      message.textContent = error.message || "Could not upload this file.";
    } finally { button.disabled = false; }
  });
  $("resourceList").addEventListener("click", async (event) => {
    const link = event.target.closest("a[data-download]");
    if (!link) return;
    event.preventDefault();
    try {
      const stored = await getFile(link.dataset.download);
      if (!stored) throw new Error("This file is no longer available in this browser.");
      const url = URL.createObjectURL(stored.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = stored.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { window.alert(error.message || "Could not download this file."); }
  });

  renderStudents();
  renderResources();
  if (window.lucide) lucide.createIcons();
})();
