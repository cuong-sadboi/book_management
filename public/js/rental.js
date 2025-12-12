(() => {
	const API = 'api/rentals.php';
	const tbody = document.getElementById('rentalTbody');
	const pagination = document.getElementById('rentalPagination');
	const searchInput = document.getElementById('rentalSearch');
	const statusFilter = document.getElementById('statusFilter');
	const perPageSelect = document.getElementById('rentalPerPage');
	const btnRefresh = document.getElementById('btnRentalRefresh');
	const btnAdd = document.getElementById('btnRentalAdd');
	const btnDeleteSelected = document.getElementById('btnRentalDeleteSelected');
	const btnExportExcel = document.getElementById('btnRentalExportExcel');
	const selectAll = document.getElementById('rentalSelectAll');
	const selectedCountEl = document.getElementById('rentalSelectedCount');

	let allRentalIds = [];
	let selectedIds = new Set();

	const state = { q: '', status: '', page: 1, limit: Number(perPageSelect?.value) || 10 };
	let debounceId;
	let currentAbortController;

	const updateSelectAllState = () => {
		if (!selectAll) return;
		if (allRentalIds.length === 0) {
			selectAll.checked = false;
			selectAll.indeterminate = false;
		} else if (selectedIds.size === allRentalIds.length) {
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
		selectedCountEl.textContent = `Selected: ${selectedIds.size} / ${allRentalIds.length}`;
	};

	const escapeHtml = (value = '') =>
		value.toString().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

	const formatDate = (dateStr) => {
		if (!dateStr) return '-';
		const d = new Date(dateStr);
		return d.toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
	};

	const getStatusBadge = (status) => {
		const badges = {
			'active': '<span class="badge bg-success">Active</span>',
			'returned': '<span class="badge bg-secondary">Returned</span>',
			'overdue': '<span class="badge bg-danger">Overdue</span>'
		};
		return badges[status] || status;
	};

	async function loadRentals() {
		const params = new URLSearchParams({ page: 1, per_page: 1000 });
		if (state.q) params.append('q', state.q);
		if (state.status) params.append('status', state.status);

		currentAbortController?.abort();
		const controller = new AbortController();
		currentAbortController = controller;

		try {
			const res = await fetch(`${API}?${params.toString()}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const payload = await res.json();
			const allRentals = payload.data ?? [];

			allRentalIds = allRentals.map((r) => String(r.id));
			selectedIds = new Set([...selectedIds].filter((id) => allRentalIds.includes(id)));

			const total = payload.meta?.total ?? allRentals.length;
			const totalPages = Math.max(1, Math.ceil(total / state.limit));

			if (state.page > totalPages) {
				state.page = totalPages;
			}

			const start = (state.page - 1) * state.limit;
			const pageItems = allRentals.slice(start, start + state.limit);

			renderRows(pageItems);
			renderPagination(total);
			updateSelectAllState();
		} catch (error) {
			if (error.name === 'AbortError') return;
			tbody.innerHTML = `<tr><td colspan="9">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
			pagination.innerHTML = '';
			allRentalIds = [];
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
		tbody.innerHTML = rows.map((r) => `
			<tr data-id="${r.id ?? ''}">
				<td><input type="checkbox" data-id="${r.id ?? ''}" ${selectedIds.has(String(r.id)) ? 'checked' : ''}></td>
				<td>${r.id}</td>
				<td>${escapeHtml(r.user_name ?? '')} <br><small class="text-muted">${escapeHtml(r.user_email ?? '')}</small></td>
				<td>${escapeHtml(r.book_title ?? '')} <br><small class="text-muted">${escapeHtml(r.book_isbn ?? '')}</small></td>
				<td>${formatDate(r.rental_date)}</td>
				<td>${formatDate(r.due_date)}</td>
				<td>${formatDate(r.return_date)}</td>
				<td>${getStatusBadge(r.status)}</td>
				<td>
					<div class="d-flex flex-column gap-1">
						${r.status === 'active' ? `<button class="btn-return btn btn-sm btn-success d-inline-flex align-items-center justify-content-center" data-id="${r.id ?? ''}" title="Return Book">Return</button>` : ''}
						${r.status !== 'returned' ? `<button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${r.id ?? ''}" title="Edit" aria-label="Edit">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
						</button>` : ''}
						<button class="btn-delete btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center" data-id="${r.id ?? ''}" title="Delete" aria-label="Delete">
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
				loadRentals();
			});
			pagination.appendChild(btn);
		}
	}

	perPageSelect?.addEventListener('change', () => {
		state.limit = Number(perPageSelect.value) || 10;
		state.page = 1;
		loadRentals();
	});

	searchInput.addEventListener('input', ({ target }) => {
		const nextQuery = target.value.trim();
		clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			if (state.q === nextQuery) return;
			state.q = nextQuery;
			state.page = 1;
			selectedIds.clear();
			loadRentals();
		}, 300);
	});

	statusFilter?.addEventListener('change', () => {
		state.status = statusFilter.value;
		state.page = 1;
		selectedIds.clear();
		loadRentals();
	});

	btnRefresh.addEventListener('click', () => {
		searchInput.value = '';
		state.q = '';
		state.status = '';
		state.page = 1;
		if (statusFilter) statusFilter.value = '';
		selectedIds.clear(); // Clear selection on refresh
		loadRentals();
	});

	selectAll?.addEventListener('change', (event) => {
		if (event.target.checked) {
			selectedIds = new Set(allRentalIds);
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
			alert('Please select at least one rental.');
			return;
		}
		if (!confirm(`Delete ${ids.length} selected rental(s)?`)) return;

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
				loadRentals();
			})
			.catch((error) => alert(error.message || 'Delete failed.'));
	});

	btnAdd?.addEventListener('click', () => { window.location.href = 'create-rental.html'; });

	btnExportExcel?.addEventListener('click', () => {
		if (!selectedIds.size) {
			alert('Please select at least one rental to export.');
			return;
		}

		const form = document.createElement('form');
		form.method = 'POST';
		form.action = 'api/rentals/export.php';
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
		const returnBtn = event.target.closest('.btn-return');
		if (returnBtn?.dataset.id) {
			event.stopPropagation();
			if (!confirm('Confirm return this book?')) return;
			
			fetch(API, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					id: parseInt(returnBtn.dataset.id), 
					return_date: new Date().toISOString().slice(0, 19).replace('T', ' ')
				}),
			})
				.then(async (res) => {
					const raw = await res.text();
					let data = null;
					try { data = raw ? JSON.parse(raw) : null; } catch {}
					return { ok: res.ok, data, raw };
				})
				.then(({ ok, data, raw }) => {
					if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to return book.');
					loadRentals();
				})
				.catch((error) => alert(error.message || 'Return failed.'));
			return;
		}

		const editBtn = event.target.closest('.btn-edit');
		if (editBtn?.dataset.id) {
			event.stopPropagation();
			window.location.href = `update-rental.html?id=${editBtn.dataset.id}`;
			return;
		}

		const deleteBtn = event.target.closest('.btn-delete');
		if (deleteBtn?.dataset.id) {
			event.stopPropagation();
			if (!confirm('Are you sure you want to delete this rental?')) return;
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
					if (!ok || data?.error) throw new Error(data?.error || raw || 'Unable to delete rental.');
					selectedIds.delete(String(deleteBtn.dataset.id));
					loadRentals();
				})
				.catch((error) => alert(error.message || 'Delete failed.'));
			return;
		}

		const interactive = event.target.closest('input, button, a, label');
		if (interactive) return;
		const row = event.target.closest('tr[data-id]');
		if (!row?.dataset.id) return;
		window.location.href = `details-rental.html?id=${row.dataset.id}`;
	});

	loadRentals();
})();
