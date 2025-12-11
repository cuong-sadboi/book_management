const AUTHOR_API = 'api/authors.php';

(() => {
	const tbody = document.getElementById('authorTbody');
	const pagination = document.getElementById('authorPagination');
	const searchInput = document.getElementById('authorSearch');
	const perPageSelect = document.getElementById('authorPerPage');
	const btnRefresh = document.getElementById('btnAuthorRefresh');
	const btnAdd = document.getElementById('btnAuthorAdd');
	const btnDeleteSelected = document.getElementById('btnAuthorDeleteSelected');
	const btnExportExcel = document.getElementById('btnAuthorExportExcel');
	const selectAll = document.getElementById('authorSelectAll');
	const selectedCountEl = document.getElementById('authorSelectedCount');

	const HIDDEN_KEY = 'author_hidden_ids';
	const getHiddenIds = () => {
		try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]').map(String)); }
		catch { return new Set(); }
	};
	const setHiddenIds = (set) => localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set)));

	const BOOK_HIDDEN_KEY = 'book_hidden_ids';
	const getHiddenBookIds = () => {
		try { return JSON.parse(localStorage.getItem(BOOK_HIDDEN_KEY) || '[]').map(String); }
		catch { return []; }
	};

	// Track all IDs and selected IDs across pages
	let allAuthorIds = [];
	let selectedIds = new Set();
	let allAuthorsData = []; // Store all authors data for export

	const state = { q: '', page: 1, limit: Number(perPageSelect.value) || 10 };
	let debounceId;
	let currentAbortController;

	const updateSelectAllState = () => {
		if (!selectAll) return;
		if (allAuthorIds.length === 0) {
			selectAll.checked = false;
			selectAll.indeterminate = false;
		} else if (selectedIds.size === allAuthorIds.length) {
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
		tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
			cb.checked = selectedIds.has(String(cb.dataset.id));
		});
	};

	const updateSelectedCount = () => {
		if (!selectedCountEl) return;
		selectedCountEl.textContent = `Selected: ${selectedIds.size} / ${allAuthorIds.length}`;
	};

	const escapeHtml = (value = '') =>
		value.toString().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

	async function loadAuthors() {
		// First fetch all to get total IDs
		const allParams = new URLSearchParams({ page: 1, per_page: 1000 });
		if (state.q) allParams.append('q', state.q);

		currentAbortController?.abort();
		const controller = new AbortController();
		currentAbortController = controller;

		try {
			const allRes = await fetch(`${AUTHOR_API}?${allParams.toString()}`, { signal: controller.signal });
			if (!allRes.ok) throw new Error(`HTTP ${allRes.status}`);
			const allPayload = await allRes.json();
			const allAuthors = allPayload.data ?? [];
			
			// Store all author IDs and data
			allAuthorIds = allAuthors.map((a) => String(a.id));
			allAuthorsData = allAuthors; // Store for export
			
			// Clean up selectedIds
			selectedIds = new Set([...selectedIds].filter((id) => allAuthorIds.includes(id)));

			const total = allPayload.meta?.total ?? allAuthors.length;
			const totalPages = Math.max(1, Math.ceil(total / state.limit));
			
			if (total > 0 && state.page > totalPages) {
				state.page = totalPages;
			}

			// Get current page items
			const start = (state.page - 1) * state.limit;
			const pageItems = allAuthors.slice(start, start + state.limit);

			renderRows(pageItems);
			renderPagination(total);
			updateSelectAllState();
		} catch (error) {
			if (error.name === 'AbortError') return;
			tbody.innerHTML = `<tr><td colspan="7">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
			pagination.innerHTML = '';
			allAuthorIds = [];
			allAuthorsData = [];
			selectedIds.clear();
			updateSelectAllState();
		} finally {
			if (currentAbortController === controller) currentAbortController = null;
		}
	}

	function renderRows(authors) {
		if (!authors.length) {
			tbody.innerHTML = '<tr><td colspan="7">Không có dữ liệu.</td></tr>';
			return;
		}
		tbody.innerHTML = authors.map((author) => `
			<tr data-id="${author.id ?? ''}">
				<td><input type="checkbox" data-id="${author.id ?? ''}" ${selectedIds.has(String(author.id)) ? 'checked' : ''}></td>
				<td>${escapeHtml(author.name ?? '')}</td>
				<td>${escapeHtml(author.email ?? '')}</td>
				<td>${escapeHtml(author.nationality ?? '')}</td>
				<td>${author.birth_year ?? ''}</td>
				<td class="text-truncate" style="max-width: 260px;">${escapeHtml(author.bio ?? '')}</td>
				<td>
					<div class="d-flex flex-column gap-1">
						<button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${author.id ?? ''}" title="Edit" aria-label="Edit">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
						</button>
						<button class="btn-delete btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center" data-id="${author.id ?? ''}" title="Delete" aria-label="Delete">
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
				loadAuthors();
			});
			pagination.appendChild(btn);
		}
	}

	perPageSelect.addEventListener('change', () => {
		state.limit = Number(perPageSelect.value) || 10;
		state.page = 1;
		loadAuthors();
	});

	searchInput.addEventListener('input', ({ target }) => {
		const nextQuery = target.value.trim();
		clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			if (state.q === nextQuery) return;
			state.q = nextQuery;
			state.page = 1;
			selectedIds.clear();
			loadAuthors();
		}, 300);
	});

	btnRefresh.addEventListener('click', () => {
		selectedIds.clear();
		loadAuthors();
	});

	// Select All now toggles ALL records across all pages
	selectAll.addEventListener('change', (event) => {
		if (event.target.checked) {
			selectedIds = new Set(allAuthorIds);
		} else {
			selectedIds.clear();
		}
		syncCheckboxes();
		updateSelectAllState();
	});

	tbody.addEventListener('change', (event) => {
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

	btnDeleteSelected.addEventListener('click', () => {
		const ids = Array.from(selectedIds);
		if (!ids.length) {
			alert('Please select at least one author.');
			return;
		}
		if (!confirm(`Delete ${ids.length} selected author(s)?`)) return;

		fetch(AUTHOR_API, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, hidden_book_ids: getHiddenBookIds() }),
		})
			.then(async (res) => {
				const raw = await res.text();
				let data = null;
				try { data = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
				return { ok: res.ok, data, raw };
			})
			.then(({ ok, data, raw }) => {
				if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete.');
				selectedIds.clear();
				loadAuthors();
			})
			.catch((error) => alert(error.message || 'Delete failed.'));
	});

	btnAdd.addEventListener('click', () => { window.location.href = 'create-author.html'; });

	tbody.addEventListener('click', (event) => {
		const deleteBtn = event.target.closest('.btn-delete');
		if (deleteBtn?.dataset.id) {
			event.stopPropagation();
			if (!confirm('Are you sure you want to delete this author?')) return;
			fetch(AUTHOR_API, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: deleteBtn.dataset.id, hidden_book_ids: getHiddenBookIds() }),
			})
				.then(async (res) => {
					const raw = await res.text();
					let data = null;
					try { data = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
					return { ok: res.ok, data, raw };
				})
				.then(({ ok, data, raw }) => {
					if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete author.');
					selectedIds.delete(String(deleteBtn.dataset.id));
					loadAuthors();
				})
				.catch((error) => alert(error.message || 'Delete failed.'));
			return;
		}

		const editBtn = event.target.closest('.btn-edit');
		if (editBtn?.dataset.id) {
			event.stopPropagation();
			window.location.href = `update-author.html?id=${editBtn.dataset.id}`;
			return;
		}

		const interactive = event.target.closest('input, button, a, label');
		if (interactive) return;
		const row = event.target.closest('tr[data-id]');
		if (!row?.dataset.id) return;
		window.location.href = `update-author.html?id=${row.dataset.id}`;
	});

	// Export Excel functionality
	btnExportExcel?.addEventListener('click', () => {
		if (!selectedIds.size) {
			alert('Please select at least one author to export.');
			return;
		}

		const form = document.createElement('form');
		form.method = 'POST';
		form.action = 'api/authors/export.php';
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

	loadAuthors();
})();

const BOOKS_API = 'api/books.php';

const isAuthorInUse = async (name, id) => {
	const hidden = new Set(getHiddenBookIds().map(String));
	const keys = [];
	if (name) keys.push(name);
	if (id) keys.push(String(id));
	for (const key of keys) {
		let res, payload;
		try {
			res = await fetch(`${BOOKS_API}?author=${encodeURIComponent(key)}&per_page=1000`);
			const raw = await res.text();
			try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
		} catch (err) {
			console.warn('Không thể gọi books API:', err);
			continue; // allow delete if API fails
		}
		if (!res.ok) {
			console.warn('Books API trả lỗi:', payload?.error);
			continue; // allow delete if API errors
		}
		const list = payload?.data ?? [];
		const inUse = list.some((b) => b?.author === key && !hidden.has(String(b.id ?? '')));
		if (inUse) return true;
	}
	return false;
};
