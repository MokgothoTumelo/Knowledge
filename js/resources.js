(function () {
  "use strict";
  const INDEX_KEY = "knowledge_admin_resource_index";
  const DB_NAME = "knowledge_admin_resources";
  const STORE = "files";
  const PROGRESS_KEY = "knowledge_resource_progress";
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function getResourceIndex() {
    try {
      const items = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_) { return []; }
  }
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function currentUser() {
    return window.Auth ? Auth.getUser() : null;
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("File storage is unavailable in this browser."));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open uploaded files."));
    });
  }
  async function getStoredFile(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => { const item = request.result; db.close(); resolve(item || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  function fileSize(size) {
    if (size < 1048576) return Math.max(1, Math.round(size / 1024)) + " KB";
    return (size / 1048576).toFixed(1) + " MB";
  }
  function getVisibleResources(pageKind) {
    const all = getResourceIndex().slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    let items = all;
    if (pageKind === "books") items = all.filter((item) => item.type === "Book");
    if (pageKind === "papers") items = all.filter((item) => item.type === "Question paper");
    const search = ($("searchInput")?.value || "").trim().toLowerCase();
    const gradeSelect = $(pageKind === "books" ? "bookGradeFilter" : "paperGradeFilter");
    const grade = gradeSelect ? gradeSelect.value : "all";
    return items.filter((item) => {
      const matchesGrade = grade === "all" || item.grade === grade;
      const matchesSearch = !search || [item.title, item.fileName, item.type, "grade " + item.grade].join(" ").toLowerCase().includes(search);
      return matchesGrade && matchesSearch;
    });
  }
  function resourceRow(item) {
    const typeIcon = item.type === "Book" ? "book-open" : item.type === "Question paper" ? "file-text" : "folder-open";
    const user = currentUser();
    const progress = getProgress();
    const completed = !!(user && Array.isArray(progress[user.email]) && progress[user.email].includes(item.id));
    return '<article class="uploaded-resource"><div class="uploaded-resource-icon"><i data-lucide="' + typeIcon + '"></i></div><div class="uploaded-resource-copy"><h3>' + escapeHtml(item.title) + '</h3><p>Grade ' + escapeHtml(item.grade) + ' · ' + escapeHtml(item.type) + ' · ' + escapeHtml(item.fileName) + ' · ' + escapeHtml(item.sizeLabel || "") + '</p></div><div class="uploaded-resource-actions"><button class="uploaded-complete' + (completed ? ' is-complete' : '') + '" type="button" data-complete-resource="' + escapeHtml(item.id) + '" aria-pressed="' + String(completed) + '"><i data-lucide="' + (completed ? 'circle-check' : 'circle') + '"></i><span>' + (completed ? 'Completed' : 'Mark complete') + '</span></button><button class="uploaded-download btn-download" type="button" data-download-resource="' + escapeHtml(item.id) + '"><i data-lucide="download"></i><span>Download</span></button></div></article>';
  }
  function emptyState(type, hasAny, host) {
    const text = hasAny ? "No resources match your search or grade filter." : "No " + (type === "books" ? "books" : type === "papers" ? "question papers" : "resources") + " have been uploaded yet.";
    host.innerHTML = '<div class="uploaded-empty"><i data-lucide="folder-open"></i><h3>Nothing to show yet</h3><p>' + escapeHtml(text) + '</p></div>';
  }
  function render() {
    const home = $("homeResourceList");
    const booksGrid = $("booksGrid");
    const papersGrid = $("papersGrid");
    if (home) {
      const items = getVisibleResources("home").slice(0, 6);
      home.innerHTML = items.length ? items.map(resourceRow).join("") : '<div class="uploaded-empty"><i data-lucide="folder-open"></i><h3>No resources uploaded yet</h3><p>New uploads will appear here once added by the administrator.</p></div>';
    }
    if (booksGrid) {
      const items = getVisibleResources("books");
      const anyBooks = getResourceIndex().some((item) => item.type === "Book");
      $("bookCount").textContent = items.length + " book" + (items.length === 1 ? "" : "s");
      if (items.length) booksGrid.innerHTML = items.map(resourceRow).join("");
      else emptyState("books", anyBooks, booksGrid);
    }
    if (papersGrid) {
      const items = getVisibleResources("papers");
      const anyPapers = getResourceIndex().some((item) => item.type === "Question paper");
      const count = $("paperCount");
      if (count) count.textContent = items.length + " paper" + (items.length === 1 ? "" : "s");
      if (items.length) papersGrid.innerHTML = items.map(resourceRow).join("");
      else emptyState("papers", anyPapers, papersGrid);
    }
    if (window.lucide) lucide.createIcons();
  }
  async function download(id) {
    const stored = await getStoredFile(id);
    if (!stored || !stored.blob) throw new Error("This file is not available in this browser.");
    const url = URL.createObjectURL(stored.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = stored.name || "resource";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("bookGradeFilter")?.addEventListener("change", render);
  $("paperGradeFilter")?.addEventListener("change", render);
  $("searchInput")?.addEventListener("input", render);
  document.addEventListener("click", (event) => {
    const completeButton = event.target.closest("[data-complete-resource]");
    if (completeButton) {
      const user = currentUser();
      if (!user) {
        window.notify ? window.notify("Sign in to save your learning progress.") : window.alert("Sign in to save your learning progress.");
        return;
      }
      const item = getResourceIndex().find((resource) => resource.id === completeButton.dataset.completeResource);
      if (!item) return;
      const progress = getProgress();
      const ids = Array.isArray(progress[user.email]) ? progress[user.email] : [];
      if (ids.includes(item.id)) {
        progress[user.email] = ids.filter((id) => id !== item.id);
        try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
        window.notify?.("Progress updated.");
      } else {
        progress[user.email] = ids.concat(item.id);
        try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
        window.KnowledgeNotifications?.publishCompletion(item, user.email);
        window.notify?.("Marked as complete.");
      }
      render();
      return;
    }
    const button = event.target.closest("[data-download-resource]");
    if (!button) return;
    event.preventDefault();
    download(button.dataset.downloadResource).catch((error) => window.alert(error.message || "Could not download this file."));
  });
  window.addEventListener("storage", (event) => { if (event.key === INDEX_KEY) render(); });
  render();
})();
