// Minimal frontend for books: fetch, render, paging/sort/search, add/edit/delete, bulk delete
const API = 'api/db.php';

(() => {
  const tbody = document.getElementById('tbody');
  const pagination = document.getElementById('pagination');
  const searchInput = document.getElementById('search');
  const perPageSelect = document.getElementById('perPage');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnAdd = document.getElementById('btnAdd');
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const selectAll = document.getElementById('selectAll');
  const selectedCountEl = document.getElementById('selectedCount');

  const HIDDEN_KEY = 'book_hidden_ids';
  const getHiddenIds = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]').map(String));
    } catch {
      return new Set();
    }
  };
  const setHiddenIds = (set) => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set)));
  };

  // Track all visible IDs and selected IDs across pages
  let allVisibleIds = [];
  let selectedIds = new Set();
  let allBooksData = []; // Store all books data for export

  const updateSelectAllState = () => {
    if (!selectAll) return;
    if (allVisibleIds.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else if (selectedIds.size === allVisibleIds.length) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else if (selectedIds.size > 0) {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    updateSelectedCount();
    syncCheckboxes();
  };

  const syncCheckboxes = () => {
    tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = selectedIds.has(String(cb.dataset.id));
    });
  };

  const updateSelectedCount = () => {
    if (!selectedCountEl) return;
    selectedCountEl.textContent = `Selected: ${selectedIds.size} / ${allVisibleIds.length}`;
  };

  const state = { q: '', page: 1, limit: Number(perPageSelect.value) || 10 };
  const currencyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  const escapeHtml = (value = '') =>
    value.toString().replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let debounceId;
  let currentAbortController;

  async function loadBooks() {
    const hidden = getHiddenIds();
    const params = new URLSearchParams({ limit: 1000, page: 1 }); // fetch all in one go
    if (state.q) params.append('q', state.q);

    currentAbortController?.abort();
    const controller = new AbortController();
    currentAbortController = controller;

    try {
      const response = await fetch(`${API}?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const all = payload.data ?? payload.records ?? [];
      const visible = all.filter((b) => !hidden.has(String(b.id ?? '')));
      
      // Store all visible IDs and books data
      allVisibleIds = visible.map((b) => String(b.id));
      allBooksData = visible; // Store for export
      
      // Clean up selectedIds - remove any that are no longer visible
      selectedIds = new Set([...selectedIds].filter((id) => allVisibleIds.includes(id)));

      const totalVisible = visible.length;
      const totalPages = Math.max(1, Math.ceil(totalVisible / state.limit));
      if (state.page > totalPages) {
        state.page = totalPages;
      }
      const start = (state.page - 1) * state.limit;
      const pageItems = visible.slice(start, start + state.limit);

      renderRows(pageItems);
      renderPagination(totalVisible);
      updateSelectAllState();
    } catch (error) {
      if (error.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="13">Không thể tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
      pagination.innerHTML = '';
      allVisibleIds = [];
      allBooksData = [];
      selectedIds.clear();
      updateSelectAllState();
    } finally {
      if (currentAbortController === controller) currentAbortController = null;
    }
  }

  function renderRows(books) {
    if (!books.length) {
      tbody.innerHTML = '<tr><td colspan="13">Không có dữ liệu.</td></tr>';
      return;
    }
    tbody.innerHTML = books.map((book) => {
      // Sử dụng total_stock và available_stock từ API nếu có
      // Nếu không, tính từ stock và rented_quantity
      const rentedQty = parseInt(book.rented_quantity) || 0;
      const currentStock = parseInt(book.stock) || 0;
      
      // total_stock = stock hiện tại + số đang thuê (vì stock đã bị trừ khi cho thuê)
      const totalStock = parseInt(book.total_stock) || (currentStock + rentedQty);
      const availableStock = parseInt(book.available_stock) || currentStock;
      
      // Xác định màu cho số có thể thuê
      let availableClass = 'text-success'; // Xanh lá mặc định
      if (availableStock === 0) {
        availableClass = 'text-danger'; // Đỏ nếu hết
      } else if (availableStock <= 2) {
        availableClass = 'text-warning'; // Vàng nếu sắp hết
      }
      
      return `
      <tr data-id="${book.id ?? ''}">
        <td><input type="checkbox" data-id="${book.id ?? ''}" ${selectedIds.has(String(book.id)) ? 'checked' : ''}></td>
        <td>${escapeHtml(book.isbn ?? '')}</td>
        <td>${escapeHtml(book.title ?? '')}</td>
        <td>${escapeHtml(book.author ?? '')}</td>
        <td>${escapeHtml(book.publisher ?? '')}</td>
        <td>${book.year ?? ''}</td>
        <td>${escapeHtml(book.genre ?? '')}</td>
        <td>${currencyFormatter.format(Number(book.price ?? 0))}</td>
        <td><span class="${availableClass} fw-bold">${availableStock}</span><span class="text-muted">/${totalStock}</span></td>
        <td>${escapeHtml(book.status ?? '')}</td>
        <td>${Number(book.is_rental) ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(book.shelf_location ?? '')}</td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn-edit btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center" data-id="${book.id ?? ''}" title="Edit" aria-label="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-9.5 9.5a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zM12.5 5.5 10.207 3.207 4 9.414V11h1.586z"/></svg>
            </button>
            <a href="details.html?id=${encodeURIComponent(book.id)}" class="btn-view btn btn-sm btn-outline-info d-inline-flex align-items-center justify-content-center" data-id="${book.id ?? ''}" title="View Details" aria-label="View Details">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg>
            </a>
          </div>
        </td>
      </tr>
    `}).join('');
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
        loadBooks();
      });
      pagination.appendChild(btn);
    }
  }

  perPageSelect.addEventListener('change', () => {
    state.limit = Number(perPageSelect.value);
    state.page = 1;
    loadBooks();
  });

  searchInput.addEventListener('input', ({ target }) => {
    const nextQuery = target.value.trim();
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (state.q === nextQuery) return;
      state.q = nextQuery;
      state.page = 1;
      selectedIds.clear(); // Clear selection on new search
      loadBooks();
    }, 300);
  });

  btnRefresh.addEventListener('click', () => {
    searchInput.value = '';
    state.q = '';
    state.page = 1;
    selectedIds.clear(); // Clear selection on refresh
    loadBooks();
  });

  // Select All now toggles ALL records across all pages
  selectAll.addEventListener('change', (event) => {
    if (event.target.checked) {
      // Select all visible IDs
      selectedIds = new Set(allVisibleIds);
    } else {
      // Deselect all
      selectedIds.clear();
    }
    syncCheckboxes();
    updateSelectedCount();
  });

  // Handle individual checkbox changes
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
    if (!selectedIds.size) {
      alert('Please select at least one book.');
      return;
    }
    if (!confirm(`Hide ${selectedIds.size} selected book(s) from the list?`)) return;

    const hidden = getHiddenIds();
    selectedIds.forEach((id) => hidden.add(String(id)));
    setHiddenIds(hidden);
    selectedIds.clear();
    loadBooks();
  });

  btnAdd.addEventListener('click', () => {
    window.location.href = 'create.html';
  });

  // Export Excel functionality
  btnExportExcel?.addEventListener('click', () => {
    if (!selectedIds.size) {
      alert('Please select at least one book to export.');
      return;
    }

    // Get selected books data
    const selectedBooks = allBooksData.filter((book) => selectedIds.has(String(book.id)));
    
    if (!selectedBooks.length) {
      alert('No books found to export.');
      return;
    }

    // Create form and submit to export endpoint
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'api/books/export.php';
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
    const editBtn = event.target.closest('.btn-edit');
    if (editBtn?.dataset.id) {
      event.stopPropagation();
      window.location.href = `update.html?id=${editBtn.dataset.id}`;
      return;
    }
  });

  loadBooks();
})();