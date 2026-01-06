(() => {
	const tableBody = document.getElementById('rentalTableBody');
	const searchInput = document.getElementById('rentalSearch');
	const statusFilter = document.getElementById('statusFilter');
	const pageSizeSelect = document.getElementById('rentalPerPage');
	const refreshBtn = document.getElementById('btnRentalRefresh');
	const createBtn = document.getElementById('btnRentalAdd');
	const exportBtn = document.getElementById('btnRentalExportExcel');
	const selectAllCheckbox = document.getElementById('selectAllCheckbox');

	if (!tableBody) return;

	let currentPage = 1;
	let pageSize = 10;
	let allRentals = [];
	let allVisibleRentals = [];
	let selectedIds = new Set();
	let bookCache = {};
	let debounceId;
	let currentAbortController;

	const getBookTitle = async (bookId) => {
		if (bookCache[bookId]) return bookCache[bookId];
		try {
			const res = await fetch(`api/books.php?id=${encodeURIComponent(bookId)}`);
			const payload = await res.json().catch(() => null);
			const book = payload?.data ?? payload ?? null;
			const title = book?.title || book?.name || 'Unknown';
			bookCache[bookId] = title;
			return title;
		} catch (e) {
			bookCache[bookId] = 'Unknown';
			return 'Unknown';
		}
	};

	const getBookTitlesForRental = (rental) => {
		if (!Array.isArray(rental.items) || rental.items.length === 0) return 'N/A';
		return rental.items.map(item => escapeHtml(bookCache[item.book_id] || item.book_title || 'Unknown')).join(', ');
	};

	const loadRentals = async () => {
		const params = new URLSearchParams({ page: 1, per_page: 1000 });
		if (searchInput.value.trim()) params.append('q', searchInput.value.trim());
		if (statusFilter.value) params.append('status', statusFilter.value);

		currentAbortController?.abort();
		const controller = new AbortController();
		currentAbortController = controller;

		try {
			const res = await fetch(`api/rentals.php?${params.toString()}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const payload = await res.json().catch(() => null);
			
			allRentals = (Array.isArray(payload) ? payload : payload?.data || []).filter(r => r && r.id && !r.deleted_at);
			
			const bookIds = new Set();
			allRentals.forEach(rental => {
				if (Array.isArray(rental.items)) {
					rental.items.forEach(item => {
						if (item.book_id) bookIds.add(item.book_id);
					});
				}
			});

			await Promise.all(Array.from(bookIds).map(id => getBookTitle(id)));

			selectedIds = new Set([...selectedIds].filter((id) => allRentals.some(r => String(r.id) === String(id))));

			const totalPages = Math.max(1, Math.ceil(allRentals.length / pageSize));
			if (currentPage > totalPages) currentPage = totalPages;

			renderTable();
		} catch (error) {
			if (error.name === 'AbortError') return;
			console.error('Error loading rentals:', error);
			tableBody.innerHTML = `<tr><td colspan="9" class="alert alert-danger mb-0">Error loading rentals: ${escapeHtml(String(error))}</td></tr>`;
			document.getElementById('rentalPagination').innerHTML = '';
			allRentals = [];
			selectedIds.clear();
			updateSelectedCount();
		} finally {
			if (currentAbortController === controller) currentAbortController = null;
		}
	};

	const renderTable = () => {
		const searchTerm = searchInput.value.toLowerCase();
		const statusValue = statusFilter.value;

		const filtered = allRentals.filter(rental => {
			const matchSearch = searchTerm === '' || 
				(rental.user_name && rental.user_name.toLowerCase().includes(searchTerm)) ||
				(rental.user_email && rental.user_email.toLowerCase().includes(searchTerm)) ||
				getBookTitlesForRental(rental).toLowerCase().includes(searchTerm);
			
			const matchStatus = statusValue === '' || rental.status === statusValue;
			
			return matchSearch && matchStatus;
		});

		allVisibleRentals = filtered;

		if (filtered.length === 0) {
			tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-5">No rentals found.</td></tr>';
			document.getElementById('rentalPagination').innerHTML = '';
			updateSelectedCount();
			return;
		}

		const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
		
		const startIdx = (currentPage - 1) * pageSize;
		const endIdx = Math.min(startIdx + pageSize, filtered.length);
		const paginatedRentals = filtered.slice(startIdx, endIdx);

		const html = paginatedRentals.map(rental => {
			const bookTitles = getBookTitlesForRental(rental);
			const isReturned = rental.status === 'returned';
			const isActive = rental.status === 'active';
			return `
				<tr data-rental-id="${escapeHtml(rental.id)}">
					<td><input type="checkbox" class="rentalCheckbox" value="${escapeHtml(rental.id)}" data-id="${rental.id}" ${selectedIds.has(String(rental.id)) ? 'checked' : ''}></td>
					<td>${escapeHtml(rental.id)}</td>
					<td><div>${escapeHtml(rental.user_name || '-')}</div><small class="text-muted">${escapeHtml(rental.user_email || '-')}</small></td>
					<td>${bookTitles}</td>
					<td>${formatDate(rental.rental_date)}</td>
					<td>${!rental.due_date ? '-' : new Date(rental.due_date).toLocaleDateString('vi-VN')}</td>
					<td>${formatDate(rental.return_date)}</td>
					<td>${getStatusBadge(rental.status)}</td>
					<td>
						${isActive ? `
							<div class="d-flex flex-column gap-1">
								<button class="btn-return btn btn-sm btn-outline-success w-100" data-id="${rental.id}">Return</button>
								<div class="d-flex gap-1">
									<a href="update-rental.html?id=${encodeURIComponent(rental.id)}" class="btn btn-sm btn-outline-primary flex-fill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg></a>
									<a href="details-rental.html?id=${encodeURIComponent(rental.id)}" class="btn btn-sm btn-outline-info flex-fill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg></a>
								</div>
							</div>
						` : isReturned ? `
							<a href="details-rental.html?id=${encodeURIComponent(rental.id)}" class="btn btn-sm btn-outline-info w-100"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg></a>
						` : `
							<div class="d-flex gap-1">
								<a href="update-rental.html?id=${encodeURIComponent(rental.id)}" class="btn btn-sm btn-outline-primary flex-fill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg></a>
								<a href="details-rental.html?id=${encodeURIComponent(rental.id)}" class="btn btn-sm btn-outline-info flex-fill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg></a>
							</div>
						`}
					</td>
				</tr>
			`;
		}).join('');

		tableBody.innerHTML = html;

		document.querySelectorAll('.rentalCheckbox').forEach(checkbox => {
			checkbox.addEventListener('change', (e) => {
				const id = String(e.target.dataset.id);
				e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
				updateSelectAllState();
			});
		});

		document.querySelectorAll('.btn-return').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const rentalId = btn.dataset.id;
				if (confirm('Mark this rental as returned?')) {
					try {
						btn.disabled = true;
						const res = await fetch('api/rentals.php', {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ 
								id: parseInt(rentalId),
								status: 'returned',
								return_date: getVietnamDateTime()
							})
						});
						const data = await res.json();
						if (!res.ok || data?.error) throw new Error(data?.error || 'Failed to return rental');
						await loadRentals();
					} catch (err) {
						alert(err.message || 'Unable to return rental');
						btn.disabled = false;
					}
				}
			});
		});

		updateSelectAllState();
		updatePagination(filtered.length);
	};

	const updateSelectAllState = () => {
		const checkboxes = document.querySelectorAll('.rentalCheckbox');
		const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
		if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
		updateSelectedCount();
	};

	const updateSelectedCount = () => {
		const el = document.getElementById('rentalSelectedCount');
		if (el) el.textContent = `Selected: ${selectedIds.size} / ${allVisibleRentals.length}`;
	};

	const updatePagination = (totalItems) => {
		const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
		const paginationEl = document.getElementById('rentalPagination');
		if (!paginationEl) return;
		paginationEl.innerHTML = '';

		if (totalPages <= 1) return;

		for (let page = 1; page <= totalPages; page++) {
			const btn = document.createElement('button');
			btn.textContent = page;
			btn.type = 'button';
			if (page === currentPage) {
				btn.disabled = true;
				btn.classList.add('active');
			}
			btn.addEventListener('click', () => {
				if (page === currentPage) return;
				currentPage = page;
				renderTable();
			});
			paginationEl.appendChild(btn);
		}
	};

	selectAllCheckbox?.addEventListener('change', (e) => {
		if (e.target.checked) {
			allVisibleRentals.forEach(rental => selectedIds.add(String(rental.id)));
		} else {
			selectedIds.clear();
		}
		document.querySelectorAll('.rentalCheckbox').forEach(cb => cb.checked = e.target.checked);
		updateSelectedCount();
	});

	searchInput?.addEventListener('input', () => {
		currentPage = 1;
		clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			selectedIds.clear();
			loadRentals();
		}, 300);
	});

	statusFilter?.addEventListener('change', () => {
		currentPage = 1;
		selectedIds.clear();
		loadRentals();
	});

	pageSizeSelect?.addEventListener('change', (e) => {
		pageSize = parseInt(e.target.value);
		currentPage = 1;
		renderTable();
	});

	refreshBtn?.addEventListener('click', () => {
		searchInput.value = '';
		statusFilter.value = '';
		currentPage = 1;
		selectedIds.clear();
		loadRentals();
	});

	createBtn?.addEventListener('click', () => {
		window.location.href = 'create-rental.html';
	});

	exportBtn?.addEventListener('click', () => {
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

	loadRentals();
})();
