(function () {
  "use strict";
  const NOTIFICATIONS_KEY = "knowledge_notifications";
  const USERS_KEY = "knowledge_users";
  const $ = (selector, root) => (root || document).querySelector(selector);

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }
  function writeNotifications(items) {
    try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(-150))); }
    catch (error) { console.warn("Could not save notifications", error); }
  }
  function createNotification(type, title, message, recipients, url) {
    const emails = Array.from(new Set((recipients || []).filter(Boolean).map((email) => String(email).toLowerCase())));
    if (!emails.length) return;
    const items = readJSON(NOTIFICATIONS_KEY, []);
    items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), type, title, message, recipients: emails, readBy: [], url, createdAt: Date.now() });
    writeNotifications(items);
    render();
  }
  function currentEmail() {
    return window.Auth && Auth.getUser() ? Auth.getUser().email.toLowerCase() : "";
  }
  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function formatTime(value) {
    const time = Number(value);
    if (!Number.isFinite(time)) return "";
    const diff = Math.max(0, Date.now() - time);
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + " min ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " hr ago";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(time));
  }
  function ensurePanel() {
    const bell = $(".notification");
    if (!bell || $("#notificationPanel")) return;
    bell.type = "button";
    bell.setAttribute("aria-label", "Notifications");
    bell.setAttribute("aria-expanded", "false");
    const badge = $("b", bell);
    if (badge) { badge.hidden = true; badge.textContent = ""; badge.setAttribute("aria-hidden", "true"); }
    const panel = document.createElement("section");
    panel.id = "notificationPanel";
    panel.className = "notification-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Notifications");
    bell.insertAdjacentElement("afterend", panel);
    bell.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = panel.hidden;
      panel.hidden = !open;
      bell.setAttribute("aria-expanded", String(open));
      if (open) render();
    });
    document.addEventListener("click", (event) => {
      if (panel.hidden || panel.contains(event.target) || bell.contains(event.target)) return;
      panel.hidden = true;
      bell.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        bell.setAttribute("aria-expanded", "false");
        bell.focus();
      }
    });
  }
  function markRead(id, email) {
    const items = readJSON(NOTIFICATIONS_KEY, []);
    const item = items.find((entry) => entry.id === id);
    if (item && !item.readBy.includes(email)) item.readBy.push(email);
    writeNotifications(items);
  }
  function render() {
    const bell = $(".notification");
    const panel = $("#notificationPanel");
    if (!bell || !panel) return;
    const email = currentEmail();
    const all = readJSON(NOTIFICATIONS_KEY, []);
    const items = email ? all.filter((item) => (item.recipients || []).includes(email)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) : [];
    const unread = items.filter((item) => !(item.readBy || []).includes(email)).length;
    const badge = $("b", bell);
    if (badge) { badge.textContent = unread > 9 ? "9+" : String(unread); badge.hidden = unread === 0; }
    if (panel.hidden) return;
    let body;
    if (!email) {
      body = '<div class="notification-empty"><i data-lucide="user-round"></i><p>Sign in to see notifications for your account.</p></div>';
    } else if (!items.length) {
      body = '<div class="notification-empty"><i data-lucide="bell-ring"></i><p>You’re all caught up. New uploads and completed resources will appear here.</p></div>';
    } else {
      body = '<div class="notification-list">' + items.slice(0, 30).map((item) => {
        const isUnread = !(item.readBy || []).includes(email);
        return '<article class="notification-item' + (isUnread ? ' unread' : '') + '"><span class="notification-item-icon"><i data-lucide="' + (item.type === "upload" ? "file-plus-2" : "circle-check") + '"></i></span><div class="notification-item-copy"><strong>' + escapeHTML(item.title) + '</strong><p>' + escapeHTML(item.message) + '</p><small>' + escapeHTML(formatTime(item.createdAt)) + '</small><div class="notification-item-actions">' + (item.url ? '<a href="' + escapeHTML(item.url) + '">Open</a>' : '') + (isUnread ? '<button type="button" data-mark-read="' + escapeHTML(item.id) + '">Mark read</button>' : '') + '</div></div></article>';
      }).join("") + '</div>';
    }
    panel.innerHTML = '<div class="notification-panel-heading"><div><h2>Notifications</h2><p>' + (unread ? unread + ' unread' : 'Updates for your account') + '</p></div>' + (unread ? '<button type="button" data-mark-all>Mark all read</button>' : '') + '</div>' + body;
    panel.querySelectorAll("[data-mark-read]").forEach((button) => button.addEventListener("click", () => { markRead(button.dataset.markRead, email); render(); }));
    panel.querySelector("[data-mark-all]")?.addEventListener("click", () => {
      const updated = readJSON(NOTIFICATIONS_KEY, []);
      updated.forEach((item) => { if ((item.recipients || []).includes(email) && !item.readBy.includes(email)) item.readBy.push(email); });
      writeNotifications(updated);
      render();
    });
    if (window.lucide) lucide.createIcons();
  }

  window.KnowledgeNotifications = {
    publishUpload(resource) {
      const users = readJSON(USERS_KEY, []);
      const recipients = Array.isArray(users) ? users.filter((user) => {
        const gradeMatches = String(user.grade || "") === String(resource.grade || "");
        const subjects = Array.isArray(user.subjects) ? user.subjects : [];
        const subjectMatches = resource.subject === "All subjects" || subjects.includes(resource.subject);
        return gradeMatches && subjectMatches;
      }).map((user) => user.email) : [];
      const route = resource.type === "Book" ? "books.html" : resource.type === "Question paper" ? "papers.html" : "index.html#uploadedResources";
      createNotification("upload", "New resource for Grade " + resource.grade, resource.title + " · " + (resource.subject || "All subjects") + " (" + resource.type + ")", recipients, route);
    },
    publishCompletion(resource, email) {
      createNotification("completion", "Resource completed", "You marked “" + resource.title + "” for Grade " + resource.grade + " as complete.", [email], resource.type === "Book" ? "books.html" : resource.type === "Question paper" ? "papers.html" : "index.html#uploadedResources");
    },
  };

  ensurePanel();
  render();
  window.addEventListener("storage", (event) => { if (event.key === NOTIFICATIONS_KEY || event.key === "knowledge_session") render(); });
  window.addEventListener("focus", render);
})();
