(() => {
    const API = 'api/genres.php';
    const tbody = document.getElementById('genreTbody');
    const pagination = document.getElementById('genrePagination');
    const searchInput = document.getElementById('genreSearch');
    const perPageSelect = document.getElementById('genrePerPage');
    const btnRefresh = document.getElementById('btnGenreRefresh');
    const btnAdd = document.getElementById('btnGenreAdd');
    const btnDeleteSelected = document.getElementById('btnGenreDeleteSelected');
    const btnExportExcel = document.getElementById('btnGenreExportExcel');
    const selectAll = document.getElementById('genreSelectAll');
    const selectedCountEl = document.getElementById('genreSelectedCount');

    const BOOK_HIDDEN_KEY = 'book_hidden_ids';

    let allGenreIds = [];
    let selectedIds = new Set();

    const state = { q: '', page: 1, limit: Number(perPageSelect?.value) || 10 };
    let debounceId;
    let currentAbortController;

    const updateSelectAllState = () => {
        if (!selectAll) return;
        if (allGenreIds.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        } else if (selectedIds.size === allGenreIds.length) {
            selectAll.checked = true;
            selectAll.indeterminate = false;
        } else if (selectedIds.size > 0) {
            selectAll.checked = false;
            selectAll.indeterminate = true;
        } else {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        }
        syncCheckboxes();
        updateSelectedCount();
    };

    const syncCheckboxes = () => {
        tbody?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.checked = selectedIds.has(String(cb.dataset.id));
        });
    };

    const updateSelectedCount = () => {
        if (!selectedCountEl) return;
        selectedCountEl.textContent = `Selected: ${selectedIds.size} / ${allGenreIds.length}`;
    };

    async function loadGenres() {
        const allParams = new URLSearchParams({ page: 1, per_page: 1000 });
        if (state.q) allParams.append('q', state.q);

        currentAbortController?.abort();
        const controller = new AbortController();
        currentAbortController = controller;

        try {
            const res = await fetch(`${API}?${allParams.toString()}`, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const allGenres = payload.data ?? [];

            allGenreIds = allGenres.map((g) => String(g.id));
            selectedIds = new Set([...selectedIds].filter((id) => allGenreIds.includes(id)));

            const total = payload.meta?.total ?? allGenres.length;
            const totalPages = Math.max(1, Math.ceil(total / state.limit));

            if (state.page > totalPages) state.page = totalPages;

            const start = (state.page - 1) * state.limit;
            const pageItems = allGenres.slice(start, start + state.limit);

            renderRows(pageItems);
            renderPagination(total);
            updateSelectAllState();
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (tbody) tbody.innerHTML = `<tr><td colspan="4">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
            if (pagination) pagination.innerHTML = '';
            allGenreIds = [];
            selectedIds.clear();
            updateSelectAllState();
        } finally {
            if (currentAbortController === controller) currentAbortController = null;
        }
    }

    function renderRows(rows) {
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4">Không có dữ liệu.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((g) => `
            <tr data-id="${g.id ?? ''}">
                <td><input type="checkbox" data-id="${g.id ?? ''}" ${selectedIds.has(String(g.id)) ? 'checked' : ''}></td>
                <td>${escapeHtml(g.name ?? '')}</td>
                <td class="text-truncate" style="max-width: 320px;">${escapeHtml(g.description ?? '')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${g.id ?? ''}" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
                        </button>
                        <a href="details-genre.html?id=${encodeURIComponent(g.id)}" class="btn-view btn btn-sm btn-outline-info d-inline-flex align-items-center justify-content-center" title="View Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg>
                        </a>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderPagination(total) {
        if (!pagination) return;
        const totalPages = Math.max(1, Math.ceil(total / state.limit));
        pagination.innerHTML = '';
        for (let page = 1; page <= totalPages; page++) {
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

    // Event listeners
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
            selectedIds.clear();
            loadGenres();
        }, 300);
    });

    btnRefresh?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.q = '';
        state.page = 1;
        selectedIds.clear();
        loadGenres();
    });

    selectAll?.addEventListener('change', (event) => {
        if (event.target.checked) {
            selectedIds = new Set(allGenreIds);
        } else {
            selectedIds.clear();
        }
        syncCheckboxes();
        updateSelectAllState();
    });

    tbody?.addEventListener('change', (event) => {
        if (event.target.matches('input[type="checkbox"]')) {
            const id = String(event.target.dataset.id);
            if (event.target.checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            updateSelectAllState();
        }
    });

    btnDeleteSelected?.addEventListener('click', () => {
        const ids = Array.from(selectedIds);
        if (!ids.length) {
            alert('Please select at least one genre.');
            return;
        }
        if (!confirm(`Delete ${ids.length} selected genre(s)?`)) return;

        const hiddenBookIds = Array.from(getHiddenIds(BOOK_HIDDEN_KEY));
        fetch(API, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, hidden_book_ids: hiddenBookIds }),
        })
            .then(async (res) => {
                const raw = await res.text();
                let data = null;
                try { data = raw ? JSON.parse(raw) : null; } catch {}
                return { ok: res.ok, data, raw };
            })
            .then(({ ok, data, raw }) => {
                if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete.');
                selectedIds.clear();
                loadGenres();
            })
            .catch((error) => alert(error.message || 'Delete failed.'));
    });

    btnAdd?.addEventListener('click', () => {
        window.location.href = 'create-genre.html';
    });

    btnExportExcel?.addEventListener('click', () => {
        if (!selectedIds.size) {
            alert('Please select at least one genre to export.');
            return;
        }

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'api/genres/export.php';
        form.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'ids';
        input.value = JSON.stringify(Array.from(selectedIds));
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    });

    tbody?.addEventListener('click', (event) => {
        const editBtn = event.target.closest('.btn-edit');
        if (editBtn?.dataset.id) {
            event.stopPropagation();
            window.location.href = `update-genre.html?id=${editBtn.dataset.id}`;
        }
    });

    // Initialize
    if (tbody) loadGenres();
})();
