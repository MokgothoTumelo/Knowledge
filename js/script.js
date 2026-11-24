/* ============================================================
   Knowledge – unified script
   Global search · Favorites · Recently Viewed · Page logic
   ============================================================ */

lucide.createIcons();

const toast = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ---------- Storage keys ---------- */
const STORAGE = {
  favorites: "knowledge_favorites",
  recent: "knowledge_recently_viewed",
};

/* One-time migration: keep data saved under the old StudyHub name */
(function migrateOldKeys() {
  try {
    [["studyhub_favorites", STORAGE.favorites], ["studyhub_recently_viewed", STORAGE.recent]].forEach(function (pair) {
      const old = localStorage.getItem(pair[0]);
      if (old !== null && localStorage.getItem(pair[1]) === null) localStorage.setItem(pair[1], old);
      if (old !== null) localStorage.removeItem(pair[0]);
    });
  } catch (e) {}
})();

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage write failed", e);
  }
}

/* ---------- Shared content data ---------- */
const BOOKS = [];
const PAPERS = [];
const TUTORIALS = [];

const ALL_CONTENT = [...BOOKS, ...PAPERS, ...TUTORIALS];

function findContent(id) {
  return ALL_CONTENT.find((item) => item.id === id) || null;
}

/* ---------- Favorites ---------- */
function getFavorites() {
  return loadJSON(STORAGE.favorites, []);
}

function isFavorite(type, id) {
  return getFavorites().some((f) => f.type === type && f.id === id);
}

function toggleFavorite(type, id) {
  let favs = getFavorites();
  const exists = favs.findIndex((f) => f.type === type && f.id === id);
  if (exists >= 0) {
    favs.splice(exists, 1);
    saveJSON(STORAGE.favorites, favs);
    showToast("Removed from favorites");
    return false;
  }
  const item = findContent(id);
  if (!item || item.type !== type) return false;
  favs.unshift({ type, id, title: item.title, addedAt: Date.now() });
  const seen = new Set();
  favs = favs.filter((f) => {
    const k = f.type + ":" + f.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  saveJSON(STORAGE.favorites, favs);
  showToast("Added to favorites");
  return true;
}

function favoriteButtonHTML(type, id) {
  const active = isFavorite(type, id);
  const label = active ? "Remove from favorites" : "Add to favorites";
  return '<button type="button" class="fav-btn ' + (active ? "is-fav" : "") + '" data-fav-type="' + type + '" data-fav-id="' + id + '" aria-label="' + label + '" title="' + label + '"><i data-lucide="heart"></i></button>';
}

function bindFavoriteButtons(root) {
  root = root || document;
  root.querySelectorAll(".fav-btn").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const type = btn.dataset.favType;
      const id = btn.dataset.favId;
      const nowFav = toggleFavorite(type, id);
      btn.classList.toggle("is-fav", nowFav);
      btn.setAttribute("aria-label", nowFav ? "Remove from favorites" : "Add to favorites");
      btn.setAttribute("title", nowFav ? "Remove from favorites" : "Add to favorites");
      lucide.createIcons();
      if (document.getElementById("favoritesGrid")) renderFavoritesPage();
    });
  });
}

/* ---------- Recently viewed ---------- */
const RECENT_LIMIT = 12;
const RECENT_HOME_LIMIT = 6;

function getRecent() {
  return loadJSON(STORAGE.recent, []);
}

function addRecent(item) {
  if (!item || !item.id || !item.type) return;
  let list = getRecent().filter((r) => !(r.type === item.type && r.id === item.id));
  list.unshift({
    type: item.type,
    id: item.id,
    title: item.title,
    viewedAt: Date.now(),
    meta: item.type === "book" ? item.author : item.type === "paper" ? item.year + " · " + item.subjectLabel : item.author,
  });
  list = list.slice(0, RECENT_LIMIT);
  saveJSON(STORAGE.recent, list);
}

/* ---------- Global search ---------- */
function searchAll(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return { papers: [], books: [], tutorials: [] };

  const match = (item) => {
    const fields = [item.title, item.author, item.categoryLabel, item.subjectLabel, item.shortDesc, item.description, item.year != null ? String(item.year) : ""]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return fields.includes(q) || q.split(/\s+/).every((w) => fields.includes(w));
  };

  return {
    papers: PAPERS.filter(match),
    books: BOOKS.filter(match),
    tutorials: TUTORIALS.filter(match),
  };
}

function typeLabel(type) {
  if (type === "paper") return "Paper";
  if (type === "book") return "Book";
  if (type === "tutorial") return "Tutorial";
  return type;
}

function openContent(item) {
  if (!item) return;
  addRecent(item);
  if (item.type === "book") {
    if (document.getElementById("booksGrid") && typeof window.__openBookModal === "function") {
      window.__openBookModal(item.id);
      return;
    }
    window.location.href = "books.html#" + item.id;
    return;
  }
  if (item.type === "paper") {
    if (document.getElementById("papersGrid") && typeof window.__openPaperModal === "function") {
      window.__openPaperModal(item.id);
      return;
    }
    window.location.href = "papers.html#" + item.id;
    return;
  }
  if (item.type === "tutorial") {
    if (window.Auth && !Auth.require("watch", item)) return;
    showToast('Opening tutorial “' + item.title + '”');
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureSearchDropdown() {
  const searchLabel = document.querySelector(".search");
  if (!searchLabel || document.getElementById("globalSearchResults")) return;
  searchLabel.classList.add("search-wrap");
  const panel = document.createElement("div");
  panel.id = "globalSearchResults";
  panel.className = "search-results";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;
  searchLabel.appendChild(panel);
}

function renderSearchResults(query) {
  const panel = document.getElementById("globalSearchResults");
  if (!panel) return;
  const q = (query || "").trim();
  if (!q) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = '<div class="search-loading">Searching…</div>';

  requestAnimationFrame(() => {
    const results = searchAll(q);
    const papers = results.papers;
    const books = results.books;
    const tutorials = results.tutorials;
    const total = papers.length + books.length + tutorials.length;

    if (total === 0) {
      panel.innerHTML = '<div class="search-empty"><i data-lucide="search-x"></i><p>No results for “' + escapeHtml(q) + '”</p><small>Try a different title, author, or keyword</small></div>';
      lucide.createIcons();
      return;
    }

    function section(title, items) {
      if (!items.length) return "";
      return (
        '<div class="search-group"><h4>' +
        title +
        " <span>" +
        items.length +
        "</span></h4><ul>" +
        items
          .slice(0, 6)
          .map(function (item) {
            const meta =
              item.type === "paper"
                ? item.year + " · " + item.subjectLabel
                : item.author || item.categoryLabel || "";
            return (
              '<li role="option" data-type="' +
              item.type +
              '" data-id="' +
              item.id +
              '" tabindex="0"><span class="search-type-badge ' +
              item.type +
              '">' +
              typeLabel(item.type) +
              '</span><div class="search-item-text"><strong>' +
              escapeHtml(item.title) +
              "</strong><small>" +
              escapeHtml(meta) +
              "</small></div></li>"
            );
          })
          .join("") +
        "</ul></div>"
      );
    }

    panel.innerHTML =
      '<div class="search-results-inner">' +
      section("Papers", papers) +
      section("Books", books) +
      section("Tutorials", tutorials) +
      '</div><div class="search-footer">' +
      total +
      " result" +
      (total !== 1 ? "s" : "") +
      "</div>";
    lucide.createIcons();

    panel.querySelectorAll("li[data-id]").forEach(function (li) {
      li.addEventListener("click", function () {
        const item = findContent(li.dataset.id);
        panel.hidden = true;
        openContent(item);
      });
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          li.click();
        }
      });
    });
  });
}

function initGlobalSearch() {
  ensureSearchDropdown();
  const input = document.getElementById("searchInput");
  if (!input) return;
  let debounceTimer;
  input.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    const val = input.value;
    debounceTimer = setTimeout(function () {
      renderSearchResults(val);
    }, 180);
  });
  input.addEventListener("focus", function () {
    if (input.value.trim()) renderSearchResults(input.value);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const panel = document.getElementById("globalSearchResults");
      if (panel) panel.hidden = true;
    }
    if (e.key === "Enter") {
      const panel = document.getElementById("globalSearchResults");
      const first = panel && panel.querySelector("li[data-id]");
      if (first) {
        e.preventDefault();
        first.click();
      } else {
        showToast('Searching for “' + (input.value || "resources") + '”');
      }
    }
  });
  document.addEventListener("click", function (e) {
    const panel = document.getElementById("globalSearchResults");
    const wrap = document.querySelector(".search-wrap");
    if (panel && wrap && !wrap.contains(e.target)) panel.hidden = true;
  });
}

/* ---------- Mobile menu & nav ---------- */
(function initMobileNav() {
  const menuButton = document.querySelector(".mobile-menu");
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  // Close button inside sidebar
  let closeBtn = sidebar.querySelector(".sidebar-close");
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.className = "sidebar-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close menu");
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    sidebar.insertBefore(closeBtn, sidebar.firstChild);
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  // Backdrop overlay
  let backdrop = document.querySelector(".sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
  }

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
    document.body.classList.add("sidebar-open");
    menuButton && menuButton.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    document.body.classList.remove("sidebar-open");
    menuButton && menuButton.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  }

  if (menuButton) {
    menuButton.setAttribute("aria-label", "Open menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  closeBtn.addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
  });

  // Close when viewport grows past mobile breakpoint
  let resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth > 830) closeSidebar();
    }, 100);
  });

  document.querySelectorAll(".nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (link.getAttribute("href") && link.getAttribute("href").startsWith("#")) {
        document.querySelectorAll(".nav a").forEach(function (item) {
          item.classList.remove("active");
        });
        link.classList.add("active");
      }
      closeSidebar();
    });
  });
})();

/* ============================================================
   BOOKS PAGE
   ============================================================ */
if (document.getElementById("booksGrid")) {
  const books = BOOKS;
  const grid = document.getElementById("booksGrid");
  const countEl = document.getElementById("bookCount");
  const modal = document.getElementById("bookModal");
  let activeFilter = "all";
  let searchQuery = "";

  function createCover(book, large) {
    const sizeClass = large ? "book-cover-lg" : "book-cover-card";
    if (book.coverImage) {
      return '<img class="book-cover-img ' + sizeClass + '" src="' + book.coverImage + '" alt="' + escapeHtml(book.title) + ' cover" />';
    }
    return '<div class="book-cover ' + book.coverColor + " " + sizeClass + '">' + book.coverLabel.replace(/\n/g, "<br>") + "</div>";
  }

  function renderBooks() {
    const filtered = books.filter(function (book) {
      const matchFilter = activeFilter === "all" || book.category === activeFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.categoryLabel.toLowerCase().includes(q) ||
        book.shortDesc.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });

    countEl.textContent = filtered.length + " book" + (filtered.length !== 1 ? "s" : "");

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="empty-state"><i data-lucide="book-x"></i><h3>No books found</h3><p>Try a different category or search term.</p></div>';
      lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered
      .map(function (book) {
        return (
          '<article class="book-card" data-id="' +
          book.id +
          '"><div class="book-card-cover">' +
          createCover(book) +
          '<div class="card-fav">' +
          favoriteButtonHTML("book", book.id) +
          '</div></div><div class="book-card-body"><span class="book-category">' +
          book.categoryLabel +
          "</span><h3>" +
          escapeHtml(book.title) +
          '</h3><p class="book-author">by ' +
          escapeHtml(book.author) +
          '</p><p class="book-short">' +
          escapeHtml(book.shortDesc) +
          '</p><div class="book-card-actions"><button class="primary btn-read" data-id="' +
          book.id +
          '"><i data-lucide="book-open"></i> Read Book</button><a class="secondary-btn btn-download" href="' +
          book.downloadUrl +
          '" data-id="' +
          book.id +
          '"><i data-lucide="download"></i> Download</a></div></div></article>'
        );
      })
      .join("");

    lucide.createIcons();
    bindCardEvents();
    bindFavoriteButtons(grid);
  }

  function bindCardEvents() {
    document.querySelectorAll(".book-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest(".btn-download") || e.target.closest(".fav-btn")) return;
        openModal(card.dataset.id);
      });
    });
    document.querySelectorAll(".btn-read").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const book = books.find(function (b) {
          return b.id === btn.dataset.id;
        });
        if (book) {
          addRecent(book);
          if (book.readUrl.startsWith("#")) showToast('Opening “' + book.title + '” (placeholder link)');
          else window.open(book.readUrl, "_blank");
        }
      });
    });
    document.querySelectorAll(".btn-download").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.stopPropagation();
        const book = books.find(function (b) {
          return b.id === link.dataset.id;
        });
        if (book && book.downloadUrl.startsWith("#")) {
          e.preventDefault();
          showToast('Download started for “' + book.title + '”');
        }
      });
    });
  }

  function openModal(id) {
    const book = books.find(function (b) {
      return b.id === id;
    });
    if (!book) return;
    addRecent(book);
    document.getElementById("modalCover").innerHTML = createCover(book, true);
    document.getElementById("modalCategory").textContent = book.categoryLabel;
    document.getElementById("modalTitle").textContent = book.title;
    document.getElementById("modalAuthor").textContent = "by " + book.author;
    document.getElementById("modalMeta").textContent = book.pages + " pages · " + book.year;
    document.getElementById("modalDesc").textContent = book.description;

    let modalFav = document.getElementById("modalFav");
    if (!modalFav) {
      const actions = document.querySelector(".modal-actions");
      if (actions) {
        modalFav = document.createElement("div");
        modalFav.id = "modalFav";
        modalFav.className = "modal-fav-wrap";
        actions.prepend(modalFav);
      }
    }
    if (modalFav) {
      modalFav.innerHTML = favoriteButtonHTML("book", book.id);
      bindFavoriteButtons(modalFav);
    }

    const readBtn = document.getElementById("modalRead");
    const dlBtn = document.getElementById("modalDownload");
    readBtn.href = book.readUrl;
    dlBtn.href = book.downloadUrl;
    readBtn.onclick = function (e) {
      if (book.readUrl.startsWith("#")) {
        e.preventDefault();
        showToast('Opening “' + book.title + '” (placeholder link)');
      }
    };
    dlBtn.onclick = function (e) {
      if (book.downloadUrl.startsWith("#")) {
        e.preventDefault();
        showToast('Download started for “' + book.title + '”');
      }
    };
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    lucide.createIcons();
  }

  window.__openBookModal = openModal;

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  const bookFilters = document.getElementById("bookFilters");
  if (bookFilters) {
    bookFilters.addEventListener("click", function (e) {
      const btn = e.target.closest("button");
      if (!btn) return;
      const sel = document.querySelector("#bookFilters .selected");
      if (sel) sel.classList.remove("selected");
      btn.classList.add("selected");
      activeFilter = btn.dataset.filter;
      renderBooks();
      showToast("Showing " + btn.textContent + " books");
    });
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      searchQuery = e.target.value;
      renderBooks();
    });
  }

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-close-modal") || e.target.closest("[data-close-modal]")) closeModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  renderBooks();
  if (location.hash) {
    const id = location.hash.slice(1);
    if (books.some(function (b) { return b.id === id; })) openModal(id);
  }
}

/* ============================================================
   HOME PAGE
   ============================================================ */
if (!document.getElementById("booksGrid") && !document.getElementById("papersGrid") && !document.getElementById("favoritesGrid")) {
  document.querySelectorAll(".filters button").forEach(function (button) {
    if (button.dataset.filter) return;
    button.addEventListener("click", function () {
      const selected = document.querySelector(".filters .selected");
      if (selected) selected.classList.remove("selected");
      button.classList.add("selected");
      showToast("Showing " + button.textContent + " resources");
    });
  });
  document.querySelectorAll(".resource-card button").forEach(function (button) {
    button.addEventListener("click", function () {
      showToast("Your download has started");
    });
  });
  document.querySelectorAll(".video-list li").forEach(function (li, i) {
    li.style.cursor = "pointer";
    li.addEventListener("click", function () {
      openContent(TUTORIALS[i]);
    });
  });
  const primaryBtn = document.querySelector(".hero .primary");
  if (primaryBtn) {
    primaryBtn.addEventListener("click", function () {
      const explore = document.querySelector(".explore");
      if (explore) explore.scrollIntoView({ behavior: "smooth" });
    });
  }
  const recentSection = document.getElementById("recentlyViewed");
  if (recentSection) recentSection.hidden = true;
}

function renderRecentlyViewed() {
  const host = document.getElementById("recentlyViewed");
  if (!host) return;
  const recent = getRecent().slice(0, RECENT_HOME_LIMIT);
  if (recent.length === 0) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML =
    '<div class="section-heading"><div><h2>Continue Reading</h2><p class="section-sub">Pick up where you left off</p></div></div><div class="recent-grid">' +
    recent
      .map(function (r) {
        const full = findContent(r.id);
        const type = r.type;
        let thumb = "";
        if (type === "book" && full) {
          thumb = '<div class="book-cover ' + full.coverColor + ' recent-thumb">' + (full.coverLabel || "").replace(/\n/g, "<br>") + "</div>";
        } else if (type === "paper") {
          thumb = '<div class="recent-icon paper-icon"><i data-lucide="file-text"></i></div>';
        } else {
          thumb = '<div class="recent-icon tutorial-icon"><i data-lucide="play"></i></div>';
        }
        return (
          '<article class="recent-card" data-type="' +
          type +
          '" data-id="' +
          r.id +
          '"><div class="recent-thumb-wrap">' +
          thumb +
          '</div><div class="recent-body"><span class="search-type-badge ' +
          type +
          '">' +
          typeLabel(type) +
          "</span><h3>" +
          escapeHtml(r.title) +
          '</h3><p class="recent-meta">' +
          escapeHtml(r.meta || "") +
          "</p></div></article>"
        );
      })
      .join("") +
    "</div>";
  lucide.createIcons();
  host.querySelectorAll(".recent-card").forEach(function (card) {
    card.addEventListener("click", function () {
      openContent(findContent(card.dataset.id));
    });
  });
}

/* ---------- Favorites page ---------- */
function renderFavoritesPage() {
  const grid = document.getElementById("favoritesGrid");
  const countEl = document.getElementById("favoritesCount");
  if (!grid) return;
  const favs = getFavorites();
  if (countEl) countEl.textContent = favs.length + " item" + (favs.length !== 1 ? "s" : "");

  if (favs.length === 0) {
    grid.innerHTML =
      '<div class="empty-state"><i data-lucide="heart"></i><h3>No favorites yet</h3><p>Tap the heart on papers, books, or tutorials to save them here.</p><a class="primary" href="index.html" style="margin-top:16px;display:inline-flex;">Explore resources</a></div>';
    lucide.createIcons();
    return;
  }

  grid.innerHTML = favs
    .map(function (f) {
      const item = findContent(f.id);
      if (!item) return "";
      const meta =
        item.type === "book"
          ? "by " + item.author
          : item.type === "paper"
            ? item.year + " · " + item.subjectLabel
            : item.author;
      let visual = "";
      if (item.type === "book") {
        visual = '<div class="book-cover ' + item.coverColor + ' book-cover-card">' + (item.coverLabel || "").replace(/\n/g, "<br>") + "</div>";
      } else if (item.type === "paper") {
        visual = '<div class="fav-type-icon paper"><i data-lucide="file-text"></i></div>';
      } else {
        visual = '<div class="fav-type-icon tutorial"><i data-lucide="play"></i></div>';
      }
      const openLabel = item.type === "paper" ? "Review" : item.type === "book" ? "Read" : "Watch";
      const openIcon = item.type === "paper" ? "eye" : item.type === "book" ? "book-open" : "play";
      return (
        '<article class="fav-card" data-type="' +
        item.type +
        '" data-id="' +
        item.id +
        '"><div class="fav-card-visual">' +
        visual +
        '</div><div class="fav-card-body"><span class="search-type-badge ' +
        item.type +
        '">' +
        typeLabel(item.type) +
        "</span><h3>" +
        escapeHtml(item.title) +
        '</h3><p class="book-author">' +
        escapeHtml(meta) +
        '</p><div class="book-card-actions"><button class="primary btn-open-fav" data-id="' +
        item.id +
        '"><i data-lucide="' +
        openIcon +
        '"></i> ' +
        openLabel +
        "</button>" +
        favoriteButtonHTML(item.type, item.id) +
        "</div></div></article>"
      );
    })
    .join("");

  lucide.createIcons();
  bindFavoriteButtons(grid);
  grid.querySelectorAll(".btn-open-fav").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      openContent(findContent(btn.dataset.id));
    });
  });
  grid.querySelectorAll(".fav-card").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest(".fav-btn") || e.target.closest(".btn-open-fav")) return;
      openContent(findContent(card.dataset.id));
    });
  });
}

if (document.getElementById("favoritesGrid")) {
  renderFavoritesPage();
}

/* Search is handled against uploaded resources by resources.js. */

document.querySelector(".notification")?.addEventListener("click", function () {
  showToast("You have 3 new notifications");
});