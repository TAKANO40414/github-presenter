"use strict";

/* ============================================================
   GitHub Presenter
   非公開GitHubリポジトリを取得し、一覧(ポートフォリオ)と
   詳細(プレゼン)の2画面で見せる静的サイト。
   PATはブラウザの localStorage にのみ保存し、外部には送らない。
   ============================================================ */

const API_BASE = "https://api.github.com";
const TOKEN_KEY = "ghp_presenter_token";

const state = {
  token: null,
  user: null,
  repos: [],
  filtered: [],
  currentRepo: null,
  editorScreenshots: [], // working copy while the showcase modal is open: [{dataUrl}]
  previewTab: "shots", // 'shots' | 'live'
  previewIndex: 0,
};

const SHOWCASE_PREFIX = "ghp_presenter_showcase_";
const MAX_SHOT_WIDTH = 1400;

const el = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheDom();
  bindEvents();

  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) {
    el.tokenInput.value = "";
    connectWithToken(saved, false);
  } else {
    showView("login");
  }
}

function cacheDom() {
  el.topbar = document.getElementById("topbar");
  el.searchInput = document.getElementById("searchInput");
  el.visibilityFilter = document.getElementById("visibilityFilter");
  el.sortSelect = document.getElementById("sortSelect");
  el.presentToggleBtn = document.getElementById("presentToggleBtn");
  el.logoutBtn = document.getElementById("logoutBtn");

  el.viewLogin = document.getElementById("view-login");
  el.viewList = document.getElementById("view-list");
  el.viewDetail = document.getElementById("view-detail");

  el.loginForm = document.getElementById("loginForm");
  el.tokenInput = document.getElementById("tokenInput");
  el.rememberToken = document.getElementById("rememberToken");
  el.loginBtn = document.getElementById("loginBtn");
  el.loginError = document.getElementById("loginError");

  el.userGreeting = document.getElementById("userGreeting");
  el.repoCount = document.getElementById("repoCount");
  el.repoGrid = document.getElementById("repoGrid");
  el.emptyState = document.getElementById("emptyState");
  el.loadingList = document.getElementById("loadingList");

  el.backToListBtn = document.getElementById("backToListBtn");
  el.detailRepoName = document.getElementById("detailRepoName");
  el.detailVisibilityBadge = document.getElementById("detailVisibilityBadge");
  el.detailRepoDesc = document.getElementById("detailRepoDesc");
  el.detailTopics = document.getElementById("detailTopics");
  el.statStars = document.getElementById("statStars");
  el.statForks = document.getElementById("statForks");
  el.statIssues = document.getElementById("statIssues");
  el.statUpdated = document.getElementById("statUpdated");
  el.readmeContent = document.getElementById("readmeContent");
  el.languageBar = document.getElementById("languageBar");
  el.languageList = document.getElementById("languageList");
  el.contributorList = document.getElementById("contributorList");
  el.commitList = document.getElementById("commitList");

  el.editShowcaseBtn = document.getElementById("editShowcaseBtn");
  el.showcaseBody = document.getElementById("showcaseBody");

  el.showcaseModalOverlay = document.getElementById("showcaseModalOverlay");
  el.closeShowcaseModalBtn = document.getElementById("closeShowcaseModalBtn");
  el.cancelShowcaseBtn = document.getElementById("cancelShowcaseBtn");
  el.deleteShowcaseBtn = document.getElementById("deleteShowcaseBtn");
  el.showcaseForm = document.getElementById("showcaseForm");
  el.scTitle = document.getElementById("scTitle");
  el.scUrl = document.getElementById("scUrl");
  el.pickScreenshotsBtn = document.getElementById("pickScreenshotsBtn");
  el.screenshotInput = document.getElementById("screenshotInput");
  el.shotCountText = document.getElementById("shotCountText");
  el.shotCurrentCount = document.getElementById("shotCurrentCount");
  el.shotThumbList = document.getElementById("shotThumbList");
  el.scProblem = document.getElementById("scProblem");
  el.scTarget = document.getElementById("scTarget");
  el.scFeatures = document.getElementById("scFeatures");
  el.scLearnings = document.getElementById("scLearnings");
  el.showcaseError = document.getElementById("showcaseError");
}

function bindEvents() {
  el.loginForm.addEventListener("submit", onLoginSubmit);
  el.logoutBtn.addEventListener("click", logout);
  el.backToListBtn.addEventListener("click", () => showView("list"));
  el.presentToggleBtn.addEventListener("click", togglePresentationMode);

  el.searchInput.addEventListener("input", debounce(applyFilters, 150));
  el.visibilityFilter.addEventListener("change", applyFilters);
  el.sortSelect.addEventListener("change", applyFilters);

  el.editShowcaseBtn.addEventListener("click", openShowcaseEditor);
  el.closeShowcaseModalBtn.addEventListener("click", closeShowcaseEditor);
  el.cancelShowcaseBtn.addEventListener("click", closeShowcaseEditor);
  el.showcaseModalOverlay.addEventListener("click", (e) => {
    if (e.target === el.showcaseModalOverlay) closeShowcaseEditor();
  });
  el.showcaseForm.addEventListener("submit", onShowcaseFormSubmit);
  el.deleteShowcaseBtn.addEventListener("click", onDeleteShowcase);
  el.pickScreenshotsBtn.addEventListener("click", () => el.screenshotInput.click());
  el.screenshotInput.addEventListener("change", onScreenshotInputChange);
}

/* ---------------- Auth ---------------- */

function onLoginSubmit(e) {
  e.preventDefault();
  const token = el.tokenInput.value.trim();
  if (!token) return;
  connectWithToken(token, el.rememberToken.checked);
}

async function connectWithToken(token, remember) {
  setLoginBusy(true);
  el.loginError.hidden = true;
  try {
    const user = await ghFetch("/user", token);
    state.token = token;
    state.user = user;
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    el.topbar.hidden = false;
    el.userGreeting.textContent = `${user.login} さんのリポジトリ`;
    showView("list");
    await loadRepos();
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    showLoginError(err);
    showView("login");
  } finally {
    setLoginBusy(false);
  }
}

function showLoginError(err) {
  el.loginError.hidden = false;
  if (err.status === 401) {
    el.loginError.textContent = "トークンが無効です。有効期限やスコープ(repo)を確認してください。";
  } else if (err.status === 403) {
    el.loginError.textContent = "APIのレート制限、またはアクセス権限が不足しています。";
  } else {
    el.loginError.textContent = `接続に失敗しました: ${err.message || err}`;
  }
}

function setLoginBusy(busy) {
  el.loginBtn.disabled = busy;
  el.loginBtn.textContent = busy ? "接続中…" : "接続する";
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  state.repos = [];
  state.currentRepo = null;
  el.topbar.hidden = true;
  el.tokenInput.value = "";
  showView("login");
}

/* ---------------- GitHub API ---------------- */

async function ghFetch(path, tokenOverride) {
  const token = tokenOverride || state.token;
  const url = path.startsWith("http") ? path : API_BASE + path;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub API error ${res.status}`);
    err.status = res.status;
    try {
      const body = await res.json();
      err.message = body.message || err.message;
    } catch (_) {}
    throw err;
  }
  return res.json();
}

async function ghFetchAllPages(path) {
  let results = [];
  let url = `${API_BASE}${path}`;
  let guard = 0;
  while (url && guard < 20) {
    guard++;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${state.token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub API error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const page = await res.json();
    results = results.concat(page);
    const link = res.headers.get("Link");
    url = parseNextLink(link);
  }
  return results;
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/* ---------------- Repo List ---------------- */

async function loadRepos() {
  el.loadingList.hidden = false;
  el.repoGrid.innerHTML = "";
  el.emptyState.hidden = true;
  try {
    const repos = await ghFetchAllPages("/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100");
    state.repos = repos;
    applyFilters();
  } catch (err) {
    el.repoGrid.innerHTML = "";
    el.emptyState.hidden = false;
    el.emptyState.querySelector("p").textContent = `リポジトリの取得に失敗しました: ${err.message || err}`;
  } finally {
    el.loadingList.hidden = true;
  }
}

function applyFilters() {
  const q = el.searchInput.value.trim().toLowerCase();
  const vis = el.visibilityFilter.value;
  const sort = el.sortSelect.value;

  let list = state.repos.filter((r) => {
    if (vis === "private" && !r.private) return false;
    if (vis === "public" && r.private) return false;
    if (!q) return true;
    const hay = `${r.name} ${r.description || ""} ${r.language || ""}`.toLowerCase();
    return hay.includes(q);
  });

  list = list.slice().sort((a, b) => {
    if (sort === "stars") return b.stargazers_count - a.stargazers_count;
    if (sort === "name") return a.name.localeCompare(b.name);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  state.filtered = list;
  renderRepoGrid(list);
}

function renderRepoGrid(repos) {
  el.repoCount.textContent = `${repos.length} 件のリポジトリ`;
  el.repoGrid.innerHTML = "";
  el.emptyState.hidden = repos.length !== 0;

  const frag = document.createDocumentFragment();
  repos.forEach((repo) => {
    const showcase = loadShowcase(repo.full_name);
    const thumbUrl = showcase && showcase.screenshots && showcase.screenshots[0];
    const card = document.createElement("div");
    card.className = "repo-card";
    card.innerHTML = `
      ${thumbUrl ? `<div class="repo-card-thumb" style="background-image:url('${thumbUrl}')"></div>` : ""}
      <div class="repo-card-top">
        <div class="repo-card-name">${escapeHtml((showcase && showcase.title) || repo.name)}</div>
        <span class="badge ${repo.private ? "badge-private" : "badge-public"}">${repo.private ? "Private" : "Public"}</span>
      </div>
      <div class="repo-card-desc">${escapeHtml(repo.description || "説明はありません")}</div>
      <div class="repo-card-meta">
        ${showcase ? `<span class="showcase-flag">✓ 紹介ページあり</span>` : ""}
        ${repo.language ? `<span><span class="lang-dot" style="background:${languageColor(repo.language)}"></span>${escapeHtml(repo.language)}</span>` : ""}
        <span>★ ${repo.stargazers_count}</span>
        <span>更新: ${formatDate(repo.updated_at)}</span>
      </div>
    `;
    card.addEventListener("click", () => openRepoDetail(repo));
    frag.appendChild(card);
  });
  el.repoGrid.appendChild(frag);
}

/* ---------------- Repo Detail (Presentation) ---------------- */

async function openRepoDetail(repo) {
  state.currentRepo = repo;
  showView("detail");
  renderDetailHeader(repo);
  renderShowcasePanel(repo);

  el.readmeContent.innerHTML = `<div class="spinner small"></div>`;
  el.languageBar.innerHTML = "";
  el.languageList.innerHTML = "";
  el.contributorList.innerHTML = `<li>読み込み中…</li>`;
  el.commitList.innerHTML = `<li>読み込み中…</li>`;

  const [languages, commits, contributors, readme] = await Promise.allSettled([
    ghFetch(`/repos/${repo.full_name}/languages`),
    ghFetch(`/repos/${repo.full_name}/commits?per_page=8`),
    ghFetch(`/repos/${repo.full_name}/contributors?per_page=10`),
    fetchReadme(repo.full_name),
  ]);

  renderLanguages(languages.status === "fulfilled" ? languages.value : {});
  renderCommits(commits.status === "fulfilled" ? commits.value : []);
  renderContributors(contributors.status === "fulfilled" ? contributors.value : []);
  renderReadme(readme.status === "fulfilled" ? readme.value : null);
}

function renderDetailHeader(repo) {
  el.detailRepoName.textContent = repo.name;
  el.detailVisibilityBadge.textContent = repo.private ? "Private" : "Public";
  el.detailVisibilityBadge.className = `badge ${repo.private ? "badge-private" : "badge-public"}`;
  el.detailRepoDesc.textContent = repo.description || "説明はありません";
  el.detailTopics.innerHTML = (repo.topics || [])
    .map((t) => `<span class="topic-chip">${escapeHtml(t)}</span>`)
    .join("");

  el.statStars.textContent = repo.stargazers_count;
  el.statForks.textContent = repo.forks_count;
  el.statIssues.textContent = repo.open_issues_count;
  el.statUpdated.textContent = formatDate(repo.updated_at);
}

function renderLanguages(languages) {
  const entries = Object.entries(languages);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (!entries.length || !total) {
    el.languageList.innerHTML = `<li>言語データがありません</li>`;
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);

  el.languageBar.innerHTML = entries
    .map(([name, bytes]) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      return `<div style="width:${pct}%; background:${languageColor(name)}" title="${escapeHtml(name)} ${pct}%"></div>`;
    })
    .join("");

  el.languageList.innerHTML = entries
    .map(([name, bytes]) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      return `<li><span class="language-swatch" style="background:${languageColor(name)}"></span>${escapeHtml(name)}<span class="language-pct">${pct}%</span></li>`;
    })
    .join("");
}

function renderContributors(contributors) {
  if (!contributors.length) {
    el.contributorList.innerHTML = `<li>データがありません</li>`;
    return;
  }
  el.contributorList.innerHTML = contributors
    .map(
      (c) => `
      <li class="contributor-item">
        <img src="${c.avatar_url}" alt="${escapeHtml(c.login)}" loading="lazy">
        <span>${escapeHtml(c.login)}</span>
        <span class="contributor-count">${c.contributions} commits</span>
      </li>`
    )
    .join("");
}

function renderCommits(commits) {
  if (!commits.length) {
    el.commitList.innerHTML = `<li>コミットが見つかりません</li>`;
    return;
  }
  el.commitList.innerHTML = commits
    .map((c) => {
      const msg = (c.commit.message || "").split("\n")[0];
      const author = c.commit.author ? c.commit.author.name : "unknown";
      const date = c.commit.author ? formatDate(c.commit.author.date) : "";
      return `
        <li class="commit-item">
          <div class="commit-message">${escapeHtml(msg)}</div>
          <div class="commit-meta">
            <span>${escapeHtml(author)}</span>
            <span>${date}</span>
            <a href="${c.html_url}" target="_blank" rel="noopener noreferrer">${c.sha.slice(0, 7)}</a>
          </div>
        </li>`;
    })
    .join("");
}

async function fetchReadme(fullName) {
  const data = await ghFetch(`/repos/${fullName}/readme`);
  const content = decodeBase64Utf8(data.content || "");
  return content;
}

function renderReadme(markdown) {
  if (markdown == null) {
    el.readmeContent.innerHTML = `<p style="color:var(--text-dim)">READMEが見つかりませんでした。</p>`;
    return;
  }
  el.readmeContent.innerHTML = renderMarkdown(markdown);
}

/* ---------------- Showcase (紹介ページ) ---------------- */

function showcaseKey(fullName) {
  return SHOWCASE_PREFIX + fullName;
}

function loadShowcase(fullName) {
  const raw = localStorage.getItem(showcaseKey(fullName));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveShowcase(fullName, data) {
  localStorage.setItem(showcaseKey(fullName), JSON.stringify(data));
}

function deleteShowcase(fullName) {
  localStorage.removeItem(showcaseKey(fullName));
}

function renderShowcasePanel(repo) {
  const showcase = loadShowcase(repo.full_name);
  state.previewTab = "shots";
  state.previewIndex = 0;

  if (!showcase) {
    el.showcaseBody.innerHTML = `
      <div class="showcase-empty">
        <p>この作品の紹介ページはまだありません。タイトル・URL・スクリーンショット・発表用メモをまとめて、プレゼン用の1枚にできます。</p>
        <button class="btn btn-primary" id="createShowcaseBtn" type="button" style="width:auto; padding:8px 20px;">紹介ページを作成する</button>
      </div>
    `;
    document.getElementById("createShowcaseBtn").addEventListener("click", openShowcaseEditor);
    return;
  }

  if (showcase.appUrl) state.previewTab = "live";

  el.showcaseBody.innerHTML = `
    <div class="showcase-title">${escapeHtml(showcase.title)}</div>
    ${renderPreviewMarkup(showcase)}
    ${renderMemoMarkup(showcase)}
  `;
  bindPreviewInteractions(showcase);
}

function renderPreviewMarkup(showcase) {
  const hasShots = showcase.screenshots && showcase.screenshots.length > 0;
  const hasUrl = !!showcase.appUrl;
  if (!hasShots && !hasUrl) return "";

  const tabs =
    hasShots && hasUrl
      ? `<div class="preview-tabs">
          <button type="button" class="tab-btn ${state.previewTab === "shots" ? "active" : ""}" data-tab="shots">スクリーンショット</button>
          <button type="button" class="tab-btn ${state.previewTab === "live" ? "active" : ""}" data-tab="live">ライブプレビュー</button>
        </div>`
      : "";

  return `
    <div class="showcase-preview">
      ${tabs}
      <div class="preview-stage-wrap" id="previewStageWrap"></div>
      ${hasShots ? `<div class="preview-thumbs" id="previewThumbs"></div>` : ""}
    </div>
  `;
}

function renderMemoMarkup(showcase) {
  const items = [
    ["①", "どんな課題を解決した？", showcase.memo && showcase.memo.problem],
    ["②", "このアプリは誰のため？", showcase.memo && showcase.memo.target],
    ["③", "どんな特徴・工夫がある？", showcase.memo && showcase.memo.features],
    ["④", "苦労した点・学んだこと", showcase.memo && showcase.memo.learnings],
  ].filter(([, , text]) => text && text.trim());

  if (!items.length) return "";

  return `
    <div class="showcase-memo">
      ${items
        .map(
          ([num, label, text]) => `
        <div class="memo-item">
          <span class="memo-num">${num}</span>
          <div>
            <h4>${escapeHtml(label)}</h4>
            <p>${escapeHtml(text)}</p>
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function bindPreviewInteractions(showcase) {
  const stageWrap = document.getElementById("previewStageWrap");
  if (!stageWrap) return;

  document.querySelectorAll(".preview-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.previewTab = btn.dataset.tab;
      renderPreviewStage(showcase);
      document.querySelectorAll(".preview-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  renderPreviewStage(showcase);
  renderPreviewThumbs(showcase);
}

function renderPreviewStage(showcase) {
  const stageWrap = document.getElementById("previewStageWrap");
  if (!stageWrap) return;

  const hasShots = showcase.screenshots && showcase.screenshots.length > 0;

  if (state.previewTab === "live" && showcase.appUrl) {
    stageWrap.innerHTML = `
      <div class="preview-stage">
        <iframe src="${escapeHtml(showcase.appUrl)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
      <a class="preview-open-link" href="${escapeHtml(showcase.appUrl)}" target="_blank" rel="noopener noreferrer">↗ 新しいタブで開く（表示されない場合はこちら）</a>
    `;
    return;
  }

  if (hasShots) {
    const idx = Math.min(state.previewIndex, showcase.screenshots.length - 1);
    const showNav = showcase.screenshots.length > 1;
    stageWrap.innerHTML = `
      <div class="preview-stage">
        ${showNav ? `<button type="button" class="preview-nav prev" id="prevShotBtn">◀</button>` : ""}
        <img src="${showcase.screenshots[idx]}" alt="スクリーンショット ${idx + 1}">
        ${showNav ? `<button type="button" class="preview-nav next" id="nextShotBtn">▶</button>` : ""}
      </div>
    `;
    if (showNav) {
      document.getElementById("prevShotBtn").addEventListener("click", () => {
        state.previewIndex = (idx - 1 + showcase.screenshots.length) % showcase.screenshots.length;
        renderPreviewStage(showcase);
        renderPreviewThumbs(showcase);
      });
      document.getElementById("nextShotBtn").addEventListener("click", () => {
        state.previewIndex = (idx + 1) % showcase.screenshots.length;
        renderPreviewStage(showcase);
        renderPreviewThumbs(showcase);
      });
    }
    return;
  }

  stageWrap.innerHTML = `<div class="preview-stage"><p class="preview-empty-stage">プレビューできる画像・URLがありません</p></div>`;
}

function renderPreviewThumbs(showcase) {
  const thumbs = document.getElementById("previewThumbs");
  if (!thumbs || !showcase.screenshots || showcase.screenshots.length < 2) {
    if (thumbs) thumbs.innerHTML = "";
    return;
  }
  thumbs.innerHTML = showcase.screenshots
    .map((src, i) => `<img class="preview-thumb ${i === state.previewIndex ? "active" : ""}" src="${src}" data-index="${i}">`)
    .join("");
  thumbs.querySelectorAll(".preview-thumb").forEach((img) => {
    img.addEventListener("click", () => {
      state.previewIndex = Number(img.dataset.index);
      state.previewTab = "shots";
      renderPreviewStage(showcase);
      renderPreviewThumbs(showcase);
      document.querySelectorAll(".preview-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "shots"));
    });
  });
}

/* ---- Showcase editor modal ---- */

function openShowcaseEditor() {
  const repo = state.currentRepo;
  if (!repo) return;
  const showcase = loadShowcase(repo.full_name);

  el.scTitle.value = (showcase && showcase.title) || repo.name;
  el.scUrl.value = (showcase && showcase.appUrl) || repo.homepage || "";
  el.scProblem.value = (showcase && showcase.memo && showcase.memo.problem) || "";
  el.scTarget.value = (showcase && showcase.memo && showcase.memo.target) || "";
  el.scFeatures.value = (showcase && showcase.memo && showcase.memo.features) || "";
  el.scLearnings.value = (showcase && showcase.memo && showcase.memo.learnings) || "";
  state.editorScreenshots = (showcase && showcase.screenshots) ? showcase.screenshots.slice() : [];
  el.showcaseError.hidden = true;
  el.deleteShowcaseBtn.hidden = !showcase;

  renderEditorThumbList();
  el.showcaseModalOverlay.hidden = false;
}

function closeShowcaseEditor() {
  el.showcaseModalOverlay.hidden = true;
  el.screenshotInput.value = "";
}

async function onScreenshotInputChange(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  el.pickScreenshotsBtn.disabled = true;
  el.pickScreenshotsBtn.textContent = "読み込み中…";
  try {
    for (const file of files) {
      const dataUrl = await resizeImageFile(file);
      state.editorScreenshots.push(dataUrl);
    }
    renderEditorThumbList();
  } catch (err) {
    el.showcaseError.hidden = false;
    el.showcaseError.textContent = `画像の読み込みに失敗しました: ${err.message || err}`;
  } finally {
    el.pickScreenshotsBtn.disabled = false;
    el.pickScreenshotsBtn.textContent = "ファイルを選択";
    el.screenshotInput.value = "";
  }
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("読み込みエラー"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像として読み込めません"));
      img.onload = () => {
        const scale = Math.min(1, MAX_SHOT_WIDTH / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderEditorThumbList() {
  const shots = state.editorScreenshots;
  el.shotCountText.textContent = shots.length ? `${shots.length} 枚選択中` : "選択されていません";
  el.shotCurrentCount.textContent = shots.length;

  el.shotThumbList.innerHTML = shots
    .map(
      (src, i) => `
      <li class="shot-thumb-item" draggable="true" data-index="${i}">
        ${i === 0 ? `<span class="shot-badge">サムネ</span>` : ""}
        <img src="${src}" alt="screenshot ${i + 1}">
        <div class="shot-thumb-controls">
          <button type="button" class="move-shot" data-dir="-1" data-index="${i}" title="左へ">◀</button>
          <button type="button" class="remove-shot" data-index="${i}" title="削除">削除</button>
          <button type="button" class="move-shot" data-dir="1" data-index="${i}" title="右へ">▶</button>
        </div>
      </li>`
    )
    .join("");

  el.shotThumbList.querySelectorAll(".move-shot").forEach((btn) => {
    btn.addEventListener("click", () => {
      moveEditorShot(Number(btn.dataset.index), Number(btn.dataset.dir));
    });
  });
  el.shotThumbList.querySelectorAll(".remove-shot").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editorScreenshots.splice(Number(btn.dataset.index), 1);
      renderEditorThumbList();
    });
  });
  setupShotDragReorder();
}

function moveEditorShot(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= state.editorScreenshots.length) return;
  const arr = state.editorScreenshots;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  renderEditorThumbList();
}

function setupShotDragReorder() {
  let dragIndex = null;
  el.shotThumbList.querySelectorAll(".shot-thumb-item").forEach((item) => {
    item.addEventListener("dragstart", () => {
      dragIndex = Number(item.dataset.index);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const dropIndex = Number(item.dataset.index);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const arr = state.editorScreenshots;
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(dropIndex, 0, moved);
      dragIndex = null;
      renderEditorThumbList();
    });
  });
}

function onShowcaseFormSubmit(e) {
  e.preventDefault();
  const repo = state.currentRepo;
  if (!repo) return;

  const title = el.scTitle.value.trim();
  if (!title) {
    el.showcaseError.hidden = false;
    el.showcaseError.textContent = "作品のタイトルを入力してください。";
    return;
  }

  const appUrl = el.scUrl.value.trim();
  if (appUrl && !/^https?:\/\//i.test(appUrl)) {
    el.showcaseError.hidden = false;
    el.showcaseError.textContent = "アプリのURLは http:// または https:// で始めてください。";
    return;
  }

  const data = {
    title,
    appUrl,
    screenshots: state.editorScreenshots.slice(),
    memo: {
      problem: el.scProblem.value.trim(),
      target: el.scTarget.value.trim(),
      features: el.scFeatures.value.trim(),
      learnings: el.scLearnings.value.trim(),
    },
  };

  try {
    saveShowcase(repo.full_name, data);
  } catch (err) {
    el.showcaseError.hidden = false;
    el.showcaseError.textContent = "保存に失敗しました（ブラウザの保存容量が上限に達した可能性があります。画像枚数を減らしてください）。";
    return;
  }

  closeShowcaseEditor();
  renderShowcasePanel(repo);
  renderRepoGrid(state.filtered);
}

function onDeleteShowcase() {
  const repo = state.currentRepo;
  if (!repo) return;
  if (!confirm("この紹介ページを削除しますか？（この端末に保存されたデータのみが削除されます）")) return;
  deleteShowcase(repo.full_name);
  closeShowcaseEditor();
  renderShowcasePanel(repo);
  renderRepoGrid(state.filtered);
}

/* ---------------- Presentation Mode ---------------- */

function togglePresentationMode() {
  const on = document.body.classList.toggle("presenting");
  el.presentToggleBtn.textContent = on ? "🖥 プレゼンモード解除" : "🖥 プレゼンモード";
}

/* ---------------- View switching ---------------- */

function showView(name) {
  el.viewLogin.hidden = name !== "login";
  el.viewList.hidden = name !== "list";
  el.viewDetail.hidden = name !== "detail";
  el.topbar.hidden = name === "login";
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------------- Minimal Markdown renderer ---------------- */

function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listType = null; // 'ul' | 'ol'
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      html += `<p>${inlineMd(paraBuf.join(" "))}</p>`;
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (inCode) {
      if (/^```/.test(line.trim())) {
        html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
        codeBuf = [];
        inCode = false;
        continue;
      }
      codeBuf.push(line);
      continue;
    }

    if (/^```/.test(line.trim())) {
      flushPara();
      closeList();
      inCode = true;
      codeLang = line.trim().slice(3);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMd(heading[2])}</h${level}>`;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara();
      closeList();
      html += `<hr>`;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      closeList();
      html += `<blockquote>${inlineMd(quote[1])}</blockquote>`;
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const wantType = ul ? "ul" : "ol";
      if (listType !== wantType) {
        closeList();
        html += `<${wantType}>`;
        listType = wantType;
      }
      html += `<li>${inlineMd((ul || ol)[1])}</li>`;
      continue;
    }

    closeList();
    paraBuf.push(line.trim());
  }
  flushPara();
  closeList();
  if (inCode && codeBuf.length) {
    html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
  }
  return html;
}

function inlineMd(text) {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${sanitizeUrl(src)}">`);
  out = out.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, txt, href) => `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
  return out;
}

function sanitizeUrl(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  if (/^[a-z0-9._\-/]+$/i.test(trimmed)) return trimmed; // relative path
  return "#";
}

/* ---------------- Utilities ---------------- */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeBase64Utf8(b64) {
  const cleaned = b64.replace(/\n/g, "");
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Go: "#00ADD8",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Shell: "#89e051",
  Rust: "#dea584",
  Vue: "#41b883",
  Dart: "#00B4AB",
};

function languageColor(name) {
  if (LANGUAGE_COLORS[name]) return LANGUAGE_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
