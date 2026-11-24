(function () {
  "use strict";
  const INDEX_KEY = "knowledge_admin_resource_index";
  const DB_NAME = "knowledge_admin_resources";
  const STORE = "files";
  const PROGRESS_KEY = "knowledge_resource_progress";
  const DOWNLOADS_KEY = "knowledge_download_history";
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
  function getDownloadHistory() {
    try { return JSON.parse(localStorage.getItem(DOWNLOADS_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function recordDownload(resourceId) {
    const user = currentUser();
    if (!user) return;
    const history = getDownloadHistory();
    const previous = Array.isArray(history[user.email]) ? history[user.email] : [];
    history[user.email] = [{ resourceId, downloadedAt: Date.now() }, ...previous.filter((entry) => entry.resourceId !== resourceId)].slice(0, 250);
    try { localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(history)); } catch (_) {}
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
    const user = currentUser();
    let items = all;
    if (pageKind === "books") items = all.filter((item) => item.type === "Book");
    if (pageKind === "papers") items = all.filter((item) => item.type === "Question paper");
    if (pageKind === "subjects") {
      if (!user || !user.grade || !Array.isArray(user.subjects)) return [];
      items = all.filter((item) => String(item.grade) === String(user.grade) && (item.subject === "All subjects" || user.subjects.includes(item.subject)));
      const filter = $("subjectFilter")?.value || "all";
      if (filter !== "all") items = items.filter((item) => item.subject === "All subjects" || item.subject === filter);
    }
    if (pageKind === "downloads") {
      if (!user) return [];
      const history = getDownloadHistory();
      const ids = Array.isArray(history[user.email]) ? history[user.email].map((entry) => entry.resourceId) : [];
      const order = new Map(ids.map((id, index) => [id, index]));
      items = all.filter((item) => order.has(item.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
    }
    const search = ($("searchInput")?.value || "").trim().toLowerCase();
    const gradeSelect = $(pageKind === "books" ? "bookGradeFilter" : pageKind === "papers" ? "paperGradeFilter" : "resourceGradeFilter");
    const grade = gradeSelect ? gradeSelect.value : "all";
    return items.filter((item) => {
      const matchesGrade = grade === "all" || item.grade === grade;
      const matchesSearch = !search || [item.title, item.fileName, item.type, item.subject, "grade " + item.grade].join(" ").toLowerCase().includes(search);
      return matchesGrade && matchesSearch;
    });
  }
  function resourceRow(item, options) {
    options = options || {};
    const typeIcon = item.type === "Book" ? "book-open" : item.type === "Question paper" ? "file-text" : "folder-open";
    const user = currentUser();
    const progress = getProgress();
    const completed = !!(user && Array.isArray(progress[user.email]) && progress[user.email].includes(item.id));
    const offlineLink = options.offlineUrl ? '<a class="uploaded-offline-link" href="' + options.offlineUrl + '" target="_blank" rel="noopener"><i data-lucide="wifi-off"></i><span>Open offline</span></a>' : "";
    const completeButton = options.downloadPage ? "" : '<button class="uploaded-complete' + (completed ? ' is-complete' : '') + '" type="button" data-complete-resource="' + escapeHtml(item.id) + '" aria-pressed="' + String(completed) + '"><i data-lucide="' + (completed ? 'circle-check' : 'circle') + '"></i><span>' + (completed ? 'Completed' : 'Mark complete') + '</span></button>';
    return '<article class="uploaded-resource"><div class="uploaded-resource-icon"><i data-lucide="' + typeIcon + '"></i></div><div class="uploaded-resource-copy"><h3>' + escapeHtml(item.title) + '</h3><p>Grade ' + escapeHtml(item.grade) + ' · ' + escapeHtml(item.subject || "All subjects") + ' · ' + escapeHtml(item.type) + ' · ' + escapeHtml(item.fileName) + ' · ' + escapeHtml(item.sizeLabel || "") + '</p></div><div class="uploaded-resource-actions">' + completeButton + offlineLink + '<button class="uploaded-download btn-download" type="button" data-download-resource="' + escapeHtml(item.id) + '"><i data-lucide="download"></i><span>Download</span></button></div></article>';
  }
  function emptyState(type, hasAny, host) {
    const text = hasAny ? "No resources match your search or grade filter." : "No " + (type === "books" ? "books" : type === "papers" ? "question papers" : "resources") + " have been uploaded yet.";
    host.innerHTML = '<div class="uploaded-empty"><i data-lucide="folder-open"></i><h3>Nothing to show yet</h3><p>' + escapeHtml(text) + '</p></div>';
  }
  function render() {
    const home = $("homeResourceList");
    const booksGrid = $("booksGrid");
    const papersGrid = $("papersGrid");
    const subjectsGrid = $("subjectsGrid");
    const downloadsGrid = $("downloadsGrid");
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
    if (subjectsGrid) renderSubjects();
    if (downloadsGrid) renderDownloads();
    if (window.lucide) lucide.createIcons();
  }
  function renderSubjects() {
    const host = $("subjectsGrid");
    const user = currentUser();
    if (!user) {
      host.innerHTML = '<div class="uploaded-empty"><i data-lucide="user-round"></i><h3>Sign in to see your subjects</h3><p>Your grade and selected subjects from sign-up will shape this list.</p></div>';
      return;
    }
    const subjectList = Array.isArray(user.subjects) ? user.subjects : [];
    const gradeText = $("studentGrade");
    if (gradeText) gradeText.textContent = user.grade ? "Grade " + user.grade : "Grade not set";
    const filter = $("subjectFilter");
    if (filter && filter.options.length <= 1) {
      filter.innerHTML = '<option value="all">All my subjects</option>' + subjectList.map((subject) => '<option value="' + escapeHtml(subject) + '">' + escapeHtml(subject) + '</option>').join("");
    }
    const chips = $("mySubjectList");
    if (chips) chips.innerHTML = subjectList.length ? subjectList.map((subject) => '<span class="subject-chip">' + escapeHtml(subject) + '</span>').join("") : '<span class="subject-chip empty">No subjects saved</span>';
    const items = getVisibleResources("subjects");
    const count = $("subjectResourceCount");
    if (count) count.textContent = items.length + " resource" + (items.length === 1 ? "" : "s");
    host.innerHTML = items.length ? items.map(resourceRow).join("") : '<div class="uploaded-empty"><i data-lucide="library-big"></i><h3>No matching resources yet</h3><p>New uploads for your grade and subjects will appear here.</p></div>';
  }
  async function renderDownloads() {
    const host = $("downloadsGrid");
    const user = currentUser();
    if (!user) {
      host.innerHTML = '<div class="uploaded-empty"><i data-lucide="user-round"></i><h3>Sign in to see your downloads</h3><p>Resources you download will be saved in this list for offline access.</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }
    const items = getVisibleResources("downloads");
    const count = $("downloadCount");
    if (count) count.textContent = items.length + " saved file" + (items.length === 1 ? "" : "s");
    if (!items.length) {
      host.innerHTML = '<div class="uploaded-empty"><i data-lucide="download"></i><h3>No downloads yet</h3><p>Download a resource while signed in and it will be saved here for offline access in this browser.</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }
    host.innerHTML = '<div class="uploaded-empty"><i data-lucide="loader-circle"></i><h3>Preparing offline files…</h3><p>Checking files stored in this browser.</p></div>';
    const rows = await Promise.all(items.map(async (item) => {
      try {
        const stored = await getStoredFile(item.id);
        const url = stored && stored.blob ? URL.createObjectURL(stored.blob) : "";
        return resourceRow(item, { downloadPage: true, offlineUrl: url });
      } catch (_) { return resourceRow(item, { downloadPage: true }); }
    }));
    host.innerHTML = rows.join("");
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
    recordDownload(id);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if ($("downloadsGrid")) renderDownloads();
  }

  $("bookGradeFilter")?.addEventListener("change", render);
  $("paperGradeFilter")?.addEventListener("change", render);
  $("resourceGradeFilter")?.addEventListener("change", render);
  $("subjectFilter")?.addEventListener("change", renderSubjects);
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
  window.addEventListener("pagehide", () => {
    document.querySelectorAll(".uploaded-offline-link").forEach((link) => {
      if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
    });
  });
  render();
})();
