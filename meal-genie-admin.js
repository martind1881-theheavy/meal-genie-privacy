// ── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://owuzabcxptxqzeqgacwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dXphYmN4cHR4cXplcWdhY3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTkyOTcsImV4cCI6MjA4ODk5NTI5N30.eaL7WhYr9aP2fJdHHeTdTOp3w-zbt-1lMh8VmwlJ_60';
const TABLE            = '/rest/v1/community_recipes';

let _token      = null;
let _allRecipes = [];
let _cookbookRecipes = [];
let _blogPosts = [];
let _filter     = 'pending';
let _activeTab  = 'cookbook';
let _pwaBaseUrl = 'https://mealgenie-app.innov8edge.sbs';

// CRM users state
let _allUsers = [];
let _userPage = 1;
const USERS_PER_PAGE = 5;

// Blog Form state
let _editingBlogId = null;
let _blogImageBase64 = "";

// ── AUTH ─────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');

  if (!email || !pass) { 
    if (errEl) errEl.textContent = 'Please enter both email and password.'; 
    return; 
  }
  btn.textContent = 'Signing in…'; 
  btn.disabled = true;
  if (errEl) errEl.textContent = '';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || `Login failed (${res.status})`);
    }

    _token = data.access_token;
    document.getElementById('adminEmail').textContent = email;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display  = 'block';
    document.getElementById('navStatus').style.display   = 'flex';
    document.getElementById('backupBtn').style.display   = 'inline-flex';
    
    // Automatically load all recipes
    await loadRecipes();
  } catch (e) {
    console.error('[Admin Login Error]', e);
    if (errEl) {
      errEl.textContent = e.message || 'Invalid login credentials';
      errEl.style.display = 'block';
    }
    showToast('Login error: ' + (e.message || 'Invalid credentials'));
  } finally {
    btn.textContent = 'Sign In →'; 
    btn.disabled = false;
  }
}

window.doLogin = doLogin;

function logout() {
  _token = null; _allRecipes = []; _cookbookRecipes = []; _blogPosts = []; _allUsers = [];
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainScreen').style.display  = 'none';
  document.getElementById('navStatus').style.display   = 'none';
  document.getElementById('backupBtn').style.display   = 'none';
  document.getElementById('loginPassword').value = '';
}

// Enter key on password
document.getElementById('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// PWA Env Selector Change
function handlePwaUrlChange() {
  _pwaBaseUrl = document.getElementById('pwaUrlSelect').value;
  showToast(`🔍— API switched to: ${_pwaBaseUrl}`);
  if (_activeTab === 'crm' && _token) {
    loadUsers();
  }
}

// ── TAB SWITCHER ──────────────────────────────────────────────
function switchAdminTab(tabName) {
  _activeTab = tabName;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  
  if (tabName === 'cookbook') {
    document.getElementById('tabBtnCookbook').classList.add('active');
    document.getElementById('tabCookbook').classList.add('active');
    renderRecipes();
  } else if (tabName === 'blogs') {
    document.getElementById('tabBtnBlogs').classList.add('active');
    document.getElementById('tabBlogs').classList.add('active');
    renderBlogs();
  } else if (tabName === 'crm') {
    document.getElementById('tabBtnCrm').classList.add('active');
    document.getElementById('tabCrm').classList.add('active');
    loadUsers();
  }
}

// ── FETCH ────────────────────────────────────────────────────
async function loadRecipes() {
  const grid = document.getElementById('recipeGrid');
  if (_activeTab === 'cookbook') {
    grid.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><p>Loading recipes...</p></div>';
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}${TABLE}?order=submitted_at.desc&limit=200`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_token}` } }
    );
    if (res.status === 401) { showToast('Session expired — please sign in again'); logout(); return; }
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    _allRecipes = await res.json();
    
    // Split into Cookbook recipes vs Blog posts
    _cookbookRecipes = _allRecipes.filter(r => r.cuisine !== 'MG_BLOG_POST');
    _blogPosts = _allRecipes.filter(r => r.cuisine === 'MG_BLOG_POST');
    
    updateStats();
    if (_activeTab === 'cookbook') renderRecipes();
    if (_activeTab === 'blogs') renderBlogs();
  } catch (e) {
    if (_activeTab === 'cookbook') {
      grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️ </span><p>${e.message}</p></div>`;
    }
  }
}


function getRecipeStatus(r) {
  if (r.approved) return 'approved';
  if (r.nutrition?.moderation_status === 'rejected' || r.rejected) return 'rejected';
  return 'pending';
}

// ── STATS ────────────────────────────────────────────────────
function updateStats() {
  const total    = _cookbookRecipes.length;
  const pending  = _cookbookRecipes.filter(r => getRecipeStatus(r) === 'pending').length;
  const approved = _cookbookRecipes.filter(r => getRecipeStatus(r) === 'approved').length;
  const rejected = _cookbookRecipes.filter(r => getRecipeStatus(r) === 'rejected').length;
  
  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statPending').textContent  = pending;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statRejected').textContent = rejected;
}

// ── FILTER (COOKBOOK) ─────────────────────────────────────────
function setFilter(f, btn) {
  _filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRecipes();
}

// ── RENDER COOKBOOK RECIPES ──
function renderRecipes() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const grid  = document.getElementById('recipeGrid');

  let filtered = _cookbookRecipes.filter(r => {
    const s = getRecipeStatus(r);
    if (_filter === 'pending')  return s === 'pending';
    if (_filter === 'approved') return s === 'approved';
    if (_filter === 'rejected') return s === 'rejected';
    return true;
  });

  if (query) {
    filtered = filtered.filter(r =>
      (r.title || '').toLowerCase().includes(query) ||
      (r.cuisine || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${_filter === 'pending' ? '🎉' : '📭'}</span>
      <p>${_filter === 'pending' ? 'No pending recipes — all caught up!' : 'No recipes found.'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = '';
  filtered.forEach(r => grid.appendChild(buildRecipeCard(r)));
}

function buildRecipeCard(r) {
  const status = getRecipeStatus(r);
  const badgeClass = { approved: 'badge-approved', rejected: 'badge-rejected', pending: 'badge-pending' }[status];
  const badgeLabel = { approved: '✓ Approved', rejected: '✕ Rejected', pending: '⏳ Pending' }[status];

  const date = (r.submitted_at || r.created_at) ? new Date(r.submitted_at || r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const nutri = r.nutrition || {};
  const nutriHtml = (nutri.calories || nutri.protein) ? `
    <div class="card-nutrition">
      ${nutri.calories ? `<span class="nutr-item"><strong>${nutri.calories}</strong> kcal</span>` : ''}
      ${nutri.protein  ? `<span class="nutr-item">🔍µ <strong>${nutri.protein}g</strong> protein</span>` : ''}
      ${nutri.carbs    ? `<span class="nutr-item">🟡 <strong>${nutri.carbs}g</strong> carbs</span>` : ''}
      ${nutri.fat      ? `<span class="nutr-item">🟠 <strong>${nutri.fat}g</strong> fat</span>` : ''}
    </div>` : '';

  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const instructions = Array.isArray(r.instructions) ? r.instructions : [];

  const card = document.createElement('div');
  card.className = `recipe-card ${status}`;
  card.dataset.id = r.id;

  card.innerHTML = `
    <div class="card-img" id="img-${r.id}">
      ${r.image_url
        ? `<img src="${r.image_url}" alt="${r.title}" loading="lazy" />`
        : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.5rem;">🍽️</div>`}
    </div>
    <div class="card-body">
      <div class="card-status-row">
        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
        <span class="card-date">${date}</span>
      </div>
      <div class="card-title">${esc(r.title || 'Untitled')}</div>
      <div class="card-cuisine">${esc(r.cuisine || '—')}</div>
      ${nutriHtml}

      <div class="card-section">
        <button class="card-section-toggle" data-action="toggle-section">
          📋 Ingredients (${ingredients.length})
          <span style="margin-left:auto;opacity:0.5;">▼</span>
        </button>
        <div class="card-section-body">
          <ul>${ingredients.map(i => `<li>${esc(typeof i === 'string' ? i : JSON.stringify(i))}</li>`).join('')}</ul>
        </div>
      </div>

      <div class="card-section">
        <button class="card-section-toggle" data-action="toggle-section">
          📋  Instructions (${instructions.length} steps)
          <span style="margin-left:auto;opacity:0.5;">▼</span>
        </button>
        <div class="card-section-body">
          <ol>${instructions.map(s => `<li>${esc(typeof s === 'string' ? s : JSON.stringify(s))}</li>`).join('')}</ol>
        </div>
      </div>

      <div class="card-actions">
        ${status !== 'approved'
          ? `<button class="btn-approve" data-action="approve" data-id="${r.id}">✓ Approve</button>` : ''}
        ${status !== 'rejected'
          ? `<button class="btn-reject" data-action="reject" data-id="${r.id}">✕ Reject</button>` : ''}
        <button class="btn-delete" data-action="delete" data-id="${r.id}" title="Delete permanently">🗑️</button>
      </div>
    </div>`;

  return card;
}

function toggleSection(btn) {
  const body = btn.nextElementSibling;
  body.classList.toggle('open');
  const arrow = btn.querySelector('span:last-child');
  if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
}

// ── COOKBOOK MODERATION API CALLS ─────────────────────────────
async function moderateRecipe(id, approve) {
  const r = _cookbookRecipes.find(x => x.id == id);
  const currentNutrition = (r && typeof r.nutrition === 'object' && r.nutrition !== null) ? { ...r.nutrition } : {};
  currentNutrition.moderation_status = approve ? 'approved' : 'rejected';

  const payload = {
    approved: !!approve,
    nutrition: currentNutrition
  };

  try {
    const res = await fetch(`${SUPABASE_URL}${TABLE}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_token}`,
        'Prefer':        'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Update failed: ' + res.status);

    // Update local state
    if (r) {
      r.approved = payload.approved;
      r.nutrition = currentNutrition;
      r.rejected = !approve;
    }

    updateStats();
    renderRecipes();
    showToast(approve ? '✓ Recipe approved and live!' : '✕ Recipe marked as rejected');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function deleteRecipe(id) {
  if (!confirm('Permanently delete this recipe? This cannot be undone.')) return;

  try {
    const res = await fetch(`${SUPABASE_URL}${TABLE}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_token}`
      }
    });
    if (!res.ok) throw new Error('Delete failed: ' + res.status);

    _cookbookRecipes = _cookbookRecipes.filter(r => r.id != id);
    _allRecipes = _allRecipes.filter(r => r.id != id);
    updateStats();
    renderRecipes();
    showToast('🗑️ Recipe deleted permanently');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── RENDER BLOGS ──────────────────────────────────────────────
function renderBlogs() {
  const tbody = document.getElementById('blogsTableBody');
  if (_blogPosts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text3);">No blog posts found. Create one above!</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  _blogPosts.forEach(blog => {
    const date = blog.created_at ? new Date(blog.created_at).toLocaleDateString() : 'N/A';
    const category = blog.ingredients?.[0] || 'BLOG';
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td style="font-weight: 500;">
        ${esc(blog.title)}
        ${blog.instructions?.[2] ? `<span style="font-size: 10px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 6px; border-radius: 10px; margin-left: 6px;">External</span>` : ''}
      </td>
      <td><span class="badge badge-cat">${esc(category)}</span></td>
      <td style="color:var(--text2); font-size:13px;">${date}</td>
      <td>
        <div style="display:flex; gap:8px;">
          <button class="btn" style="padding: 6px 12px; font-size: 0.75rem;" data-action="edit-blog" data-id="${blog.id}">Edit</button>
          <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.75rem;" data-action="delete-blog" data-id="${blog.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleBlogImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      _blogImageBase64 = canvas.toDataURL("image/jpeg", 0.7);
      document.getElementById('blogImagePreviewLabel').textContent = "Uploaded successfully! (JPEG Compressed)";
      document.getElementById('blogImagePreviewLabel').style.color = "var(--green)";
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveBlogPost() {
  const title = document.getElementById('blogTitle').value.trim();
  const category = document.getElementById('blogCategory').value;
  const readTime = document.getElementById('blogReadTime').value.trim() || '5 min read';
  const externalUrl = document.getElementById('blogExternalUrl').value.trim();
  const excerpt = document.getElementById('blogExcerpt').value.trim();
  const content = document.getElementById('blogContent').value.trim();

  if (!title || (!content && !externalUrl)) {
    alert("Title and either Content or an External URL are required!");
    return;
  }

  const btn = document.getElementById('blogSubmitBtn');
  const originalText = btn.textContent;
  btn.textContent = "Saving...";
  btn.disabled = true;

  const payload = {
    title,
    cuisine: "MG_BLOG_POST",
    image_url: _blogImageBase64 || "/inspiration_feed/perfect_sear.png",
    ingredients: [category, readTime],
    instructions: [excerpt, content, externalUrl || ""],
    user_id: "ADMIN",
    approved: true
  };

  try {
    let url = `${SUPABASE_URL}${TABLE}`;
    let method = 'POST';
    let headers = {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${_token}`
    };

    if (_editingBlogId) {
      url = `${SUPABASE_URL}${TABLE}?id=eq.${_editingBlogId}`;
      method = 'PATCH';
      headers['Prefer'] = 'return=minimal';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Save failed: ' + res.status);

    showToast(_editingBlogId ? '✍️ Blog post updated successfully!' : '✍️ Blog post published!');
    resetBlogForm();
    await loadRecipes(); // Reload to refresh
  } catch (e) {
    alert("Failed to save blog: " + e.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function editBlogPost(blog) {
  _editingBlogId = blog.id;
  document.getElementById('blogFormTitle').textContent = "Edit Blog Post";
  document.getElementById('blogTitle').value = blog.title || "";
  document.getElementById('blogCategory').value = blog.ingredients?.[0] || "LIFESTYLE";
  document.getElementById('blogReadTime').value = blog.ingredients?.[1] || "5 min read";
  document.getElementById('blogExternalUrl').value = blog.instructions?.[2] || "";
  document.getElementById('blogExcerpt').value = blog.instructions?.[0] || "";
  document.getElementById('blogContent').value = blog.instructions?.[1] || "";
  
  _blogImageBase64 = blog.image_url || "";
  if (_blogImageBase64) {
    document.getElementById('blogImagePreviewLabel').textContent = "Has existing image";
    document.getElementById('blogImagePreviewLabel').style.color = "var(--text2)";
  }

  document.getElementById('blogSubmitBtn').textContent = "Update Post";
  document.getElementById('blogCancelBtn').style.display = "inline-flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetBlogForm() {
  _editingBlogId = null;
  _blogImageBase64 = "";
  document.getElementById('blogFormTitle').textContent = "Publish New Blog Post";
  document.getElementById('blogTitle').value = "";
  document.getElementById('blogCategory').value = "LIFESTYLE";
  document.getElementById('blogReadTime').value = "5 min read";
  document.getElementById('blogExternalUrl').value = "";
  document.getElementById('blogExcerpt').value = "";
  document.getElementById('blogContent').value = "";
  document.getElementById('blogImageFile').value = "";
  document.getElementById('blogImagePreviewLabel').textContent = "No image uploaded (Default will be used)";
  document.getElementById('blogImagePreviewLabel').style.color = "var(--text2)";
  
  document.getElementById('blogSubmitBtn').textContent = "Publish Post";
  document.getElementById('blogCancelBtn').style.display = "none";
}

async function deleteBlogPost(id) {
  if (!confirm("Are you sure you want to delete this blog post?")) return;
  try {
    const res = await fetch(`${SUPABASE_URL}${TABLE}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_token}`
      }
    });
    if (!res.ok) throw new Error('Delete failed: ' + res.status);
    
    _blogPosts = _blogPosts.filter(b => b.id != id);
    _allRecipes = _allRecipes.filter(r => r.id != id);
    renderBlogs();
    showToast('🗑️ Blog post deleted');
  } catch (e) {
    alert("Failed to delete blog post: " + e.message);
  }
}

// ── USERS CRM ─────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('crmTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;"><div class="loading-spinner"></div><p>Fetching users list...</p></td></tr>`;

  try {
    const res = await fetch(`${_pwaBaseUrl}/api/admin/users`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    _allUsers = data.users || [];
    renderUsers();
  } catch (e) {
    console.error("Failed to load users:", e);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--red);">⚠️  Error connecting to CRM API (${_pwaBaseUrl}): ${e.message}<br><small>Make sure the PWA is running and CORS headers are configured.</small></td></tr>`;
  }
}

function renderUsers() {
  const tbody = document.getElementById('crmTableBody');
  if (_allUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text3);">No users found.</td></tr>`;
    return;
  }

  // Pagination bounds
  const totalPages = Math.ceil(_allUsers.length / USERS_PER_PAGE) || 1;
  if (_userPage > totalPages) _userPage = totalPages;
  document.getElementById('crmPageLabel').textContent = `Page ${_userPage} of ${totalPages}`;
  
  document.getElementById('crmPrevBtn').disabled = _userPage === 1;
  document.getElementById('crmNextBtn').disabled = _userPage === totalPages;

  const startIdx = (_userPage - 1) * USERS_PER_PAGE;
  const pageUsers = _allUsers.slice(startIdx, startIdx + USERS_PER_PAGE);

  tbody.innerHTML = '';
  pageUsers.forEach(user => {
    const stats = calculateUserDDS(user.cooked_history);
    const dateJoined = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A';
    
    // Utilization stats
    const generatedCount = user.generation_count * 3;
    const cookedCount = user.cooked_history?.length || 0;
    const abandonedCount = Math.max(0, generatedCount - cookedCount);

    // Referral wallet codes
    let walletCodesCount = 0;
    let walletHtml = '<span style="font-size:11px; color:var(--text3);">Empty</span>';
    if (user.loyalty_codes && user.loyalty_codes.length > 0) {
      walletCodesCount = user.loyalty_codes.length;
      walletHtml = `<div style="display:flex; gap:4px; flex-wrap:wrap; max-width:80px;">`;
      user.loyalty_codes.forEach(code => {
        const color = code.status === "AVAILABLE" ? "#10b981" : "#94a3b8";
        const title = `${code.reward_code} (${code.status})`;
        walletHtml += `<span title="${title}" style="width:8px; height:8px; border-radius:50%; background:${color}; display:inline-block;"></span>`;
      });
      walletHtml += `</div>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 500;">${esc(user.email)}</td>
      <td>
        ${user.is_premium 
          ? `<span class="badge badge-pro">PRO</span>` 
          : `<span class="badge badge-free">FREE</span>`}
      </td>
      <td>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-size:12px; font-weight:700; color: ${stats.ddsPct >= 50 ? '#10b981' : stats.ddsPct >= 20 ? '#f59e0b' : 'var(--text2)'};">
            ${stats.ddsPct}% DDS
          </span>
          <span style="font-size:10px; color:var(--text3);">${stats.totalUniqueComponents} items logged</span>
        </div>
      </td>
      <td>
        <div class="util-stats">
          <span style="color:var(--text); font-weight:700;">${generatedCount}</span> <span style="opacity:0.7;">generated</span><br>
          <span style="color:#10b981; font-weight:700;">${cookedCount}</span> <span style="opacity:0.7;">cooked</span><br>
          <span style="color:var(--orange); font-weight:700;">${abandonedCount}</span> <span style="opacity:0.7;">abandoned</span>
        </div>
      </td>
      <td>${walletHtml}</td>
      <td style="color:var(--text2); font-size:13px;">${dateJoined}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap; max-width:240px;">
          <button class="btn btn-blue" style="padding: 5px 8px; font-size: 0.72rem;" data-action="nudge-user" data-email="${user.email}">Nudge</button>
          <button class="btn" style="padding: 5px 8px; font-size: 0.72rem;" data-action="profile-user" data-id="${user.id}">👤 Profile</button>
          <button class="btn btn-danger" style="padding: 5px 8px; font-size: 0.72rem;" data-action="delete-user" data-id="${user.id}" data-email="${user.email}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function changeCrmPage(dir) {
  _userPage += dir;
  renderUsers();
}

async function deleteUser(userId, email) {
  if (!confirm(`Are you sure you want to permanently delete user ${email}? This will delete them from the Supabase registry.`)) return;
  try {
    const res = await fetch(`${_pwaBaseUrl}/api/admin/users?id=${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('🗑️ User deleted successfully');
    await loadUsers();
  } catch (e) {
    alert("Failed to delete user: " + e.message);
  }
}

function nudgeUser(email) {
  const subject = encodeURIComponent("Your Magic Kitchen is Waiting! 🧞‍♂️");
  const body = encodeURIComponent(`Hey there!\n\nI noticed you had the Genie generate some magical recipes recently, but haven't had a chance to cook them yet!\n\nMeal Genie Pro is designed to make your life easier and healthier. The next time you're wondering what's for dinner, just open the app and let the Genie handle it.\n\nReady to get cooking?\n👉 ${_pwaBaseUrl}\n\nStay magical,\nThe Meal Genie Team`);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

// ── DIET DIVERSITY SCORE (DDS) UTILS ──────────────────────────
function calculateUserDDS(cookedHistory) {
  const uniqueProteins = new Set();
  const uniqueVegetables = new Set();
  const uniqueGrains = new Set();
  const uniqueFats = new Set();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const history = Array.isArray(cookedHistory) ? cookedHistory : [];

  history.forEach((meal) => {
    if (!meal || typeof meal !== "object") return;
    const dateStr = meal.cooked_at || meal.cookedAt || meal.timestamp;
    if (!dateStr) return;
    const mealDate = new Date(dateStr);
    if (isNaN(mealDate.getTime())) return;
    
    if (mealDate >= sevenDaysAgo) {
      const classified = meal.ingredients_classified || {};
      (classified.proteins || []).forEach(p => {
        if (p && typeof p === "string") uniqueProteins.add(p.toLowerCase().trim());
      });
      (classified.vegetables || []).forEach(v => {
        if (v && typeof v === "string") uniqueVegetables.add(v.toLowerCase().trim());
      });
      (classified.grains || []).forEach(g => {
        if (g && typeof g === "string") uniqueGrains.add(g.toLowerCase().trim());
      });
      (classified.healthy_fats || []).forEach(f => {
        if (f && typeof f === "string") uniqueFats.add(f.toLowerCase().trim());
      });
    }
  });

  const proteinCount = uniqueProteins.size;
  const vegCount = uniqueVegetables.size;
  const grainCount = uniqueGrains.size;
  const fatCount = uniqueFats.size;

  const totalUniqueComponents = proteinCount + vegCount + grainCount + fatCount;
  const maxHealthyVariety = 14;
  const ddsPct = totalUniqueComponents > 0 
    ? Math.min(Math.round((totalUniqueComponents / maxHealthyVariety) * 100), 100)
    : 0;

  return {
    proteinsList: Array.from(uniqueProteins),
    vegetablesList: Array.from(uniqueVegetables),
    grainsList: Array.from(uniqueGrains),
    fatsList: Array.from(uniqueFats),
    proteinCount,
    vegCount,
    grainCount,
    fatCount,
    ddsPct,
    totalUniqueComponents
  };
}

// ── CRM MODAL ──────────────────────────────────────────────────
function openProfileModal(user) {
  const modal = document.getElementById('profileModal');
  document.getElementById('modalUserEmail').textContent = user.email;
  
  // Plan badge
  const planEl = document.getElementById('modalPlanBadge');
  planEl.textContent = user.is_premium ? "♛ PRO" : "FREE";
  planEl.style.color = user.is_premium ? "var(--amber)" : "var(--text)";

  // Stats
  document.getElementById('modalGenCount').textContent = `${user.generation_count} meals`;
  document.getElementById('modalCookCount').textContent = `${user.cooked_history?.length || 0} meals`;

  // DDS computation
  const dds = calculateUserDDS(user.cooked_history);
  document.getElementById('modalDdsLabel').textContent = `${dds.ddsPct}% DDS`;
  document.getElementById('modalDdsBar').style.width = `${dds.ddsPct}%`;
  
  // Color the bar based on score
  const bar = document.getElementById('modalDdsBar');
  if (dds.ddsPct >= 50) {
    bar.style.backgroundColor = "var(--green)";
  } else if (dds.ddsPct >= 20) {
    bar.style.backgroundColor = "var(--amber)";
  } else {
    bar.style.backgroundColor = "var(--red)";
  }

  // Lists & Counts
  document.getElementById('countProteins').textContent = dds.proteinCount;
  document.getElementById('listProteins').textContent = dds.proteinsList.join(', ') || 'None logged';

  document.getElementById('countVegetables').textContent = dds.vegCount;
  document.getElementById('listVegetables').textContent = dds.vegetablesList.join(', ') || 'None logged';

  document.getElementById('countGrains').textContent = dds.grainCount;
  document.getElementById('listGrains').textContent = dds.grainsList.join(', ') || 'None logged';

  document.getElementById('countFats').textContent = dds.fatCount;
  document.getElementById('listFats').textContent = dds.fatsList.join(', ') || 'None logged';

  // Cooking Log (last 10)
  const logContainer = document.getElementById('modalCookingLog');
  const history = Array.isArray(user.cooked_history) ? user.cooked_history : [];
  if (history.length === 0) {
    logContainer.innerHTML = `<p style="color:var(--text3); text-align:center; padding:12px;">No activity logged yet.</p>`;
  } else {
    // Sort descending by cooked date
    const sorted = [...history].sort((a, b) => {
      const da = new Date(a.cooked_at || a.cookedAt || a.timestamp);
      const db = new Date(b.cooked_at || b.cookedAt || b.timestamp);
      return db - da;
    });

    logContainer.innerHTML = `<ul style="list-style:none; padding-left:0; margin:0; display:flex; flex-direction:column; gap:8px;">`;
    sorted.slice(0, 10).forEach(log => {
      const dateStr = log.cooked_at || log.cookedAt || log.timestamp;
      const formattedDate = dateStr ? new Date(dateStr).toLocaleString() : 'N/A';
      logContainer.innerHTML += `
        <li style="padding: 8px 12px; border-radius: 6px; background:rgba(255,255,255,0.02); border: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:var(--text);">${esc(log.recipe_title || log.title || 'Unknown Meal')}</strong>
            <div style="font-size:10px; color:var(--text3); margin-top:2px;">Type: ${esc(log.recipe_cuisine || log.cuisine || '—')}</div>
          </div>
          <span style="font-size: 11px; color:var(--text2); font-family:'DM Mono',monospace;">${formattedDate.split(',')[0]}</span>
        </li>
      `;
    });
    logContainer.innerHTML += `</ul>`;
  }

  modal.style.display = 'flex';
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
  const modal = document.getElementById('profileModal');
  if (e.target === modal) closeProfileModal();
});

// ── BACKUP DATABASE ───────────────────────────────────────────
async function backupDatabase() {
  const btn = document.getElementById('backupBtn');
  const originalText = btn.textContent;
  btn.textContent = "⏳ Backing up...";
  btn.disabled = true;

  try {
    // 1. Fetch users from SaaS API
    const res = await fetch(`${_pwaBaseUrl}/api/admin/users`);
    const userData = await res.json();
    const allUsers = userData.users || [];

    // 2. Compile snapshot
    const backupPayload = {
      backup_timestamp: new Date().toISOString(),
      database_source: "MealGenie Pro CRM Production Database",
      total_users: allUsers.length,
      total_community_recipes: _allRecipes.length,
      community_recipes: _allRecipes,
      users: allUsers
    };

    // 3. Trigger JSON file download
    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const dateStr = new Date().toISOString().split("T")[0];
    const a = document.createElement("a");
    a.href = url;
    a.download = `mealgenie_db_snapshot_${dateStr}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("🎉 Database backup downloaded successfully!");
  } catch (e) {
    alert("Failed to back up database: " + e.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ── TOAST ────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── UTIL ─────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}



// ── PASSWORD RECOVERY ────────────────────────────────────────
let _recoveryToken = null;

function showRecoveryScreen() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('recoveryScreen').style.display = 'flex';
  const emailVal = document.getElementById('loginEmail')?.value.trim();
  if (emailVal) {
    document.getElementById('recoveryEmail').value = emailVal;
  }
  const succ = document.getElementById('recoverySuccessMsg');
  const err = document.getElementById('recoveryErrorMsg');
  if (succ) { succ.style.display = 'none'; succ.textContent = ''; }
  if (err) { err.textContent = ''; }
}

function hideRecoveryScreen() {
  document.getElementById('recoveryScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

async function sendPasswordRecovery() {
  const emailInput = document.getElementById('recoveryEmail');
  const succ = document.getElementById('recoverySuccessMsg');
  const err = document.getElementById('recoveryErrorMsg');
  const btn = document.getElementById('sendRecoveryBtn');

  const email = emailInput?.value.trim();
  if (!email) {
    err.textContent = 'Please enter your administrator email address.';
    return;
  }

  err.textContent = '';
  succ.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      succ.textContent = 'Password reset link sent! Please check your email inbox and follow the instructions.';
      succ.style.display = 'block';
    } else {
      if (data.error_code === 'email_address_invalid') {
        err.innerHTML = 'Delivery to this top-level domain is restricted by Supabase mailer. Please try your linked administrator Gmail (<strong>martind1881@gmail.com</strong>).';
      } else {
        err.textContent = data.msg || data.error_description || 'Failed to send recovery email.';
      }
    }
  } catch (e) {
    err.textContent = 'Network error: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link →';
  }
}

async function saveNewPassword() {
  const passInput = document.getElementById('newPasswordInput');
  const succ = document.getElementById('newPasswordSuccessMsg');
  const err = document.getElementById('newPasswordErrorMsg');
  const btn = document.getElementById('saveNewPasswordBtn');

  const newPass = passInput?.value;
  if (!newPass || newPass.length < 6) {
    err.textContent = 'Password must be at least 6 characters.';
    return;
  }

  err.textContent = '';
  succ.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + _recoveryToken
      },
      body: JSON.stringify({ password: newPass })
    });

    if (res.ok) {
      succ.textContent = 'Password updated successfully! Redirecting to sign in...';
      succ.style.display = 'block';
      setTimeout(() => {
        window.location.hash = '';
        document.getElementById('newPasswordScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
      }, 2000);
    } else {
      const data = await res.json().catch(() => ({}));
      err.textContent = data.msg || data.error_description || 'Failed to update password.';
    }
  } catch (e) {
    err.textContent = 'Network error: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password →';
  }
}

function checkHashForRecovery() {
  const hash = window.location.hash.substring(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  if (params.get('type') === 'recovery' && params.get('access_token')) {
    _recoveryToken = params.get('access_token');
    document.getElementById('loginScreen').style.display = 'none';
    const rec = document.getElementById('recoveryScreen');
    if (rec) rec.style.display = 'none';
    document.getElementById('newPasswordScreen').style.display = 'flex';
  }
}

// ── CSP COMPLIANT EVENT LISTENERS (MV3) ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Config
  document.getElementById('pwaUrlSelect')?.addEventListener('change', handlePwaUrlChange);
  document.getElementById('backupBtn')?.addEventListener('click', backupDatabase);
  document.getElementById('signOutBtn')?.addEventListener('click', logout);

  // Login
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
  // Password Recovery Handlers
  document.getElementById('forgotPasswordBtn')?.addEventListener('click', showRecoveryScreen);
  document.getElementById('backToLoginBtn')?.addEventListener('click', hideRecoveryScreen);
  document.getElementById('sendRecoveryBtn')?.addEventListener('click', sendPasswordRecovery);
  document.getElementById('recoveryEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendPasswordRecovery();
  });
  document.getElementById('saveNewPasswordBtn')?.addEventListener('click', saveNewPassword);
  document.getElementById('newPasswordInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewPassword();
  });

  // Check URL hash for recovery token
  checkHashForRecovery();

  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('loginEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Admin Tabs
  document.getElementById('tabBtnCookbook')?.addEventListener('click', () => switchAdminTab('cookbook'));
  document.getElementById('tabBtnBlogs')?.addEventListener('click', () => switchAdminTab('blogs'));
  document.getElementById('tabBtnCrm')?.addEventListener('click', () => switchAdminTab('crm'));

  // Recipe Filters (Delegated)
  document.querySelector('.filter-row')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (btn && btn.dataset.filter) {
      setFilter(btn.dataset.filter, btn);
    }
  });

  // Recipe Search & Refresh
  document.getElementById('searchInput')?.addEventListener('input', renderRecipes);
  document.getElementById('refreshRecipesBtn')?.addEventListener('click', loadRecipes);

  // Recipe Grid Actions (Delegated)
  document.getElementById('recipeGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'approve') {
      moderateRecipe(id, true);
    } else if (action === 'reject') {
      moderateRecipe(id, false);
    } else if (action === 'delete') {
      deleteRecipe(id);
    } else if (action === 'toggle-section') {
      toggleSection(btn);
    }
  });

  // Blog Management
  document.getElementById('uploadBlogImageBtn')?.addEventListener('click', () => {
    document.getElementById('blogImageFile')?.click();
  });
  document.getElementById('blogImageFile')?.addEventListener('change', handleBlogImageUpload);
  document.getElementById('blogSubmitBtn')?.addEventListener('click', saveBlogPost);
  document.getElementById('blogCancelBtn')?.addEventListener('click', resetBlogForm);

  // Blog Table Actions (Delegated)
  document.getElementById('blogsTableBody')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'edit-blog') {
      const blog = _blogPosts.find(b => b.id === id);
      if (blog) editBlogPost(blog);
    } else if (action === 'delete-blog') {
      deleteBlogPost(id);
    }
  });

  // CRM Pagination
  document.getElementById('crmPrevBtn')?.addEventListener('click', () => changeCrmPage(-1));
  document.getElementById('crmNextBtn')?.addEventListener('click', () => changeCrmPage(1));

  // CRM Table Actions (Delegated)
  document.getElementById('crmTableBody')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'nudge-user') {
      nudgeUser(btn.dataset.email);
    } else if (action === 'profile-user') {
      const user = _allUsers.find(u => u.id === btn.dataset.id);
      if (user) openProfileModal(user);
    } else if (action === 'delete-user') {
      deleteUser(btn.dataset.id, btn.dataset.email);
    }
  });

  // Profile Modal
  document.getElementById('closeProfileModalBtn')?.addEventListener('click', closeProfileModal);
  document.getElementById('profileModal')?.addEventListener('click', e => {
    if (e.target.id === 'profileModal') closeProfileModal();
  });
});

// Also trigger immediate check if script loaded after DOMContentLoaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
}
