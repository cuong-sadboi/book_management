(() => {
	const API = 'api/users.php';
	const tbody = document.getElementById('userTbody');
	const pagination = document.getElementById('userPagination');
	const searchInput = document.getElementById('userSearch');
	const perPageSelect = document.getElementById('userPerPage');
	const btnRefresh = document.getElementById('btnUserRefresh');
	const btnAdd = document.getElementById('btnUserAdd');
	const btnDeleteSelected = document.getElementById('btnUserDeleteSelected');
	const btnExportExcel = document.getElementById('btnUserExportExcel');
	const selectAll = document.getElementById('userSelectAll');
	const selectedCountEl = document.getElementById('userSelectedCount');

	let allUserIds = [];
	let selectedIds = new Set();
	let allUsersData = [];

	const state = { q: '', page: 1, limit: Number(perPageSelect?.value) || 10 };
	let debounceId;
	let currentAbortController;

	const updateSelectAllState = () => {
		if (!selectAll) return;
		if (allUserIds.length === 0) {
			selectAll.checked = false;
			selectAll.indeterminate = false;
		} else if (selectedIds.size === allUserIds.length) {
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
		selectedCountEl.textContent = `Selected: ${selectedIds.size} / ${allUserIds.length}`;
	};

	const escapeHtml = (value = '') =>
		value.toString().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

	async function loadUsers() {
		const allParams = new URLSearchParams({ page: 1, per_page: 1000 });
		if (state.q) allParams.append('q', state.q);

		currentAbortController?.abort();
		const controller = new AbortController();
		currentAbortController = controller;

		try {
			const res = await fetch(`${API}?${allParams.toString()}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const payload = await res.json();
			const allUsers = payload.data ?? [];

			allUserIds = allUsers.map((u) => String(u.id));
			allUsersData = allUsers;

			selectedIds = new Set([...selectedIds].filter((id) => allUserIds.includes(id)));

			const total = payload.meta?.total ?? allUsers.length;
			const totalPages = Math.max(1, Math.ceil(total / state.limit));

			if (state.page > totalPages) {
				state.page = totalPages;
			}

			const start = (state.page - 1) * state.limit;
			const pageItems = allUsers.slice(start, start + state.limit);

			renderRows(pageItems);
			renderPagination(total);
			updateSelectAllState();
		} catch (error) {
			if (error.name === 'AbortError') return;
			tbody.innerHTML = `<tr><td colspan="9">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
			pagination.innerHTML = '';
			allUserIds = [];
			allUsersData = [];
			selectedIds.clear();
			updateSelectAllState();
		} finally {
			if (currentAbortController === controller) currentAbortController = null;
		}
	}

	function renderRows(rows) {
		if (!rows.length) {
			tbody.innerHTML = '<tr><td colspan="9">Không có dữ liệu.</td></tr>';
			return;
		}
		tbody.innerHTML = rows.map((user) => `
			<tr data-id="${user.id ?? ''}">
				<td><input type="checkbox" data-id="${user.id ?? ''}" ${selectedIds.has(String(user.id)) ? 'checked' : ''}></td>
				<td>${escapeHtml(user.name ?? '')}</td>
				<td>${escapeHtml(user.username ?? '')}</td>
				<td>${escapeHtml(user.email ?? '')}</td>
				<td>${user.age ?? ''}</td>
				<td>${escapeHtml(user.location ?? '')}</td>
				<td>${escapeHtml(user.created_at ?? '')}</td>
				<td class="text-truncate" style="max-width: 260px;">${escapeHtml(user.bio ?? '')}</td>
				<td>
					<div class="d-flex flex-column gap-1">
						<button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${user.id ?? ''}" title="Edit" aria-label="Edit">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
						</button>
						<button class="btn-delete btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center" data-id="${user.id ?? ''}" title="Delete" aria-label="Delete">
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
				loadUsers();
			});
			pagination.appendChild(btn);
		}
	}

	perPageSelect?.addEventListener('change', () => {
		state.limit = Number(perPageSelect.value) || 10;
		state.page = 1;
		loadUsers();
	});

	searchInput?.addEventListener('input', ({ target }) => {
		const nextQuery = target.value.trim();
		clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			if (state.q === nextQuery) return;
			state.q = nextQuery;
			state.page = 1;
			selectedIds.clear();
			loadUsers();
		}, 300);
	});

	btnRefresh?.addEventListener('click', () => {
		selectedIds.clear();
		loadUsers();
	});

	selectAll?.addEventListener('change', (event) => {
		if (event.target.checked) {
			selectedIds = new Set(allUserIds);
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

	btnDeleteSelected?.addEventListener('click', () => {
		const ids = Array.from(selectedIds);
		if (!ids.length) {
			alert('Please select at least one user.');
			return;
		}
		if (!confirm(`Delete ${ids.length} selected user(s)?`)) return;

		fetch(API, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids }),
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
				loadUsers();
			})
			.catch((error) => alert(error.message || 'Delete failed.'));
	});

	btnAdd?.addEventListener('click', () => { window.location.href = 'create-user.html'; });

	btnExportExcel?.addEventListener('click', () => {
		if (!selectedIds.size) {
			alert('Please select at least one user to export.');
			return;
		}

		const form = document.createElement('form');
		form.method = 'POST';
		form.action = 'api/users/export.php';
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

	tbody.addEventListener('click', (event) => {
		const deleteBtn = event.target.closest('.btn-delete');
		if (deleteBtn?.dataset.id) {
			event.stopPropagation();
			if (!confirm('Are you sure you want to delete this user?')) return;
			fetch(API, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: deleteBtn.dataset.id }),
			})
				.then(async (res) => {
					const raw = await res.text();
					let data = null;
					try { data = raw ? JSON.parse(raw) : null; } catch {}
					return { ok: res.ok, data, raw };
				})
				.then(({ ok, data, raw }) => {
					if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete user.');
					selectedIds.delete(String(deleteBtn.dataset.id));
					loadUsers();
				})
				.catch((error) => alert(error.message || 'Delete failed.'));
			return;
		}

		const editBtn = event.target.closest('.btn-edit');
		if (editBtn?.dataset.id) {
			event.stopPropagation();
			window.location.href = `update-user.html?id=${editBtn.dataset.id}`;
			return;
		}

		const interactive = event.target.closest('input, button, a, label');
		if (interactive) return;
		const row = event.target.closest('tr[data-id]');
		if (!row?.dataset.id) return;
		window.location.href = `update-user.html?id=${row.dataset.id}`;
	});

	loadUsers();
})();
