(() => {
  const API = 'api/genres.php';
  const tbody = document.getElementById('genreTbody');
  const pagination = document.getElementById('genrePagination');
  const searchInput = document.getElementById('genreSearch');
  const perPageSelect = document.getElementById('genrePerPage');
  const btnRefresh = document.getElementById('btnGenreRefresh');
  const btnAdd = document.getElementById('btnGenreAdd');
  const btnDeleteSelected = document.getElementById('btnGenreDeleteSelected');
  const selectAll = document.getElementById('genreSelectAll');

  const BOOK_HIDDEN_KEY = 'book_hidden_ids';
  const getHiddenBookIds = () => {
    try { return JSON.parse(localStorage.getItem(BOOK_HIDDEN_KEY) || '[]').map(String); }
    catch { return []; }
  };

  const state = { q: '', page: 1, limit: Number(perPageSelect?.value) || 10 };
  let debounceId;
  let currentAbortController;

  const updateSelectAllState = () => {
    if (!selectAll) return;
    selectAll.checked = !!tbody.querySelector('input[type="checkbox"]:checked');
  };

  const escapeHtml = (value = '') =>
    value.toString().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  async function loadGenres() {
    const params = new URLSearchParams({ page: state.page, per_page: state.limit });
    if (state.q) params.append('q', state.q);

    currentAbortController?.abort();
    const controller = new AbortController();
    currentAbortController = controller;

    try {
      const res = await fetch(`${API}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const genres = payload.data ?? [];
      const total = payload.meta?.total ?? genres.length;

      renderRows(genres);
      renderPagination(total);
      selectAll && (selectAll.checked = false);
    } catch (error) {
      if (error.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="4">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
      pagination.innerHTML = '';
      selectAll && (selectAll.checked = false);
    } finally {
      if (currentAbortController === controller) currentAbortController = null;
    }
  }

  function renderRows(rows) {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4">Không có dữ liệu.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((g) => `
      <tr data-id="${g.id ?? ''}">
        <td><input type="checkbox" data-id="${g.id ?? ''}"></td>
        <td>${escapeHtml(g.name ?? '')}</td>
        <td class="text-truncate" style="max-width: 320px;">${escapeHtml(g.description ?? '')}</td>
        <td>
          <div class="d-flex flex-column gap-1">
            <button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${g.id ?? ''}" title="Edit" aria-label="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
            </button>
            <button class="btn-delete btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center" data-id="${g.id ?? ''}" title="Delete" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / state.limit));
    pagination.innerHTML = '';
    for (let page = 1; page <= totalPages; page += 1) {
      const btn = document.createElement('button');
      btn.textContent = page;
      if (page === state.page) {
        btn.disabled = true;
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        if (page === state.page) return;
        state.page = page;
        loadGenres();
      });
      pagination.appendChild(btn);
    }
  }

  perPageSelect?.addEventListener('change', () => {
    state.limit = Number(perPageSelect.value) || 10;
    state.page = 1;
    loadGenres();
  });

  searchInput?.addEventListener('input', ({ target }) => {
    const nextQuery = target.value.trim();
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (state.q === nextQuery) return;
      state.q = nextQuery;
      state.page = 1;
      loadGenres();
    }, 300);
  });

  btnRefresh?.addEventListener('click', () => loadGenres());

  selectAll?.addEventListener('change', (event) => {
    tbody.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });

  tbody.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) updateSelectAllState();
  });

  btnDeleteSelected?.addEventListener('click', () => {
    const ids = Array.from(tbody.querySelectorAll('input[type="checkbox"]:checked'))
      .map((checkbox) => checkbox.dataset.id)
      .filter(Boolean);
    if (!ids.length) {
      alert('Please select at least one genre.');
      return;
    }
    if (!confirm(`Delete ${ids.length} selected genre(s)?`)) return;

    fetch(API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, hidden_book_ids: getHiddenBookIds() }),
    })
      .then(async (res) => {
        const raw = await res.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        return { ok: res.ok, data, raw };
      })
      .then(({ ok, data, raw }) => {
        if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete.');
        loadGenres();
      })
      .catch((error) => alert(error.message || 'Delete failed.'));
  });

  btnAdd?.addEventListener('click', () => { window.location.href = 'create-genre.html'; });

  tbody.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.btn-delete');
    if (deleteBtn?.dataset.id) {
      event.stopPropagation();
      if (!confirm('Are you sure you want to delete this genre?')) return;
      fetch(API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteBtn.dataset.id, hidden_book_ids: getHiddenBookIds() }),
      })
        .then(async (res) => {
          const raw = await res.text();
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch {}
          return { ok: res.ok, data, raw };
        })
        .then(({ ok, data, raw }) => {
          if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete genre.');
          loadGenres();
        })
        .catch((error) => alert(error.message || 'Delete failed.'));
      return;
    }

    const editBtn = event.target.closest('.btn-edit');
    if (editBtn?.dataset.id) {
      event.stopPropagation();
      window.location.href = `update-genre.html?id=${editBtn.dataset.id}`;
      return;
    }

    const interactive = event.target.closest('input, button, a, label');
    if (interactive) return;
    const row = event.target.closest('tr[data-id]');
    if (!row?.dataset.id) return;
    window.location.href = `update-genre.html?id=${row.dataset.id}`;
  });

  loadGenres();
})();
