// Create Rental page logic
(() => {
	const form = document.getElementById('rentalForm');
	const btnAddBook = document.getElementById('btnAddBook');
	const selectedBooksContainer = document.getElementById('selectedBooksContainer');
	const booksEmptyState = document.getElementById('booksEmptyState');
	const bookSearchModalEl = document.getElementById('bookSearchModal');
	const bookSearchInput = document.getElementById('bookSearchInput');
	const bookSearchResults = document.getElementById('bookSearchResults');
	
	if (!form || !bookSearchModalEl) return;
	
	const bookSearchModal = new bootstrap.Modal(bookSearchModalEl);
	
	// User search elements
	const userSearchInput = document.getElementById('userSearchInput');
	const userSearchResults = document.getElementById('userSearchResults');
	const userIdInput = document.getElementById('userId');
	const selectedUserContainer = document.getElementById('selectedUserContainer');
	const selectedUserName = document.getElementById('selectedUserName');
	const selectedUserEmail = document.getElementById('selectedUserEmail');
	const clearUserBtn = document.getElementById('clearUserBtn');
	
	// New user form elements
	const newUserContainer = document.getElementById('newUserContainer');
	const newUserName = document.getElementById('newUserName');
	const newUserUsername = document.getElementById('newUserUsername');
	const newUserEmail = document.getElementById('newUserEmail');
	const newUserAge = document.getElementById('newUserAge');
	const newUserLocation = document.getElementById('newUserLocation');
	const newUserNote = document.getElementById('newUserNote');
	const cancelNewUserBtn = document.getElementById('cancelNewUserBtn');

	const MAX_BOOKS = 5;
	let allBooks = [];
	let allUsers = [];
	let selectedBooks = [];
	let searchDebounce;
	let isCreatingNewUser = false;

	// Set default due date (14 days from now)
	const dueDateInput = document.getElementById('dueDate');
	if (dueDateInput) {
		dueDateInput.value = getVietnamDateTimeLocal(14);
	}

	// Get current datetime for start date
	const getCurrentDateTime = () => {
		const local = getVietnamDateTimeLocal(0);
		return local.replace('T', ' ') + ':00';
	};

	// ==================== USER SEARCH ====================
	const loadUsers = async () => {
		try {
			const res = await fetch('api/users.php?per_page=10000');
			const data = await res.json();
			allUsers = (data.data || data || []).filter(u => !u.deleted_at);
		} catch (e) {
			console.error('Error loading users:', e);
			allUsers = [];
		}
	};

	const searchUsers = (query) => {
		const q = query.toLowerCase().trim();
		if (!q) return allUsers.slice(0, 10);
		return allUsers.filter(u => 
			(u.name && u.name.toLowerCase().includes(q)) ||
			(u.email && u.email.toLowerCase().includes(q)) ||
			(u.username && u.username.toLowerCase().includes(q))
		).slice(0, 10);
	};

	const renderUserSearchResults = (users, query) => {
		let html = '';
		if (users.length > 0) {
			html = users.map(u => `
				<div class="user-search-item" data-user-id="${u.id}" data-name="${escapeHtml(u.name)}" data-email="${escapeHtml(u.email)}">
					<strong>${escapeHtml(u.name)}</strong><br>
					<small class="text-muted">${escapeHtml(u.email)}</small>
				</div>
			`).join('');
		}
		if (query.trim()) {
			html += `
				<div class="user-search-item create-new" data-action="create-new">
					<i class="bi bi-person-plus me-2"></i>
					Create new user "${escapeHtml(query)}"
				</div>
			`;
		} else if (users.length === 0) {
			html = `<div class="user-search-item text-muted" style="cursor: default;">No users found.</div>`;
		}
		userSearchResults.innerHTML = html;
		userSearchResults.classList.add('show');
		
		userSearchResults.querySelectorAll('.user-search-item[data-user-id]').forEach(item => {
			item.addEventListener('click', () => selectUser(item.dataset.userId, item.dataset.name, item.dataset.email));
		});
		userSearchResults.querySelector('.user-search-item[data-action="create-new"]')?.addEventListener('click', () => {
			showNewUserForm(query);
		});
	};

	const selectUser = (userId, name, email) => {
		userIdInput.value = userId;
		selectedUserName.textContent = name;
		selectedUserEmail.textContent = email;
		userSearchInput.style.display = 'none';
		userSearchResults.classList.remove('show');
		selectedUserContainer.style.display = 'block';
		newUserContainer.style.display = 'none';
		isCreatingNewUser = false;
	};

	const showNewUserForm = (searchQuery) => {
		userSearchInput.style.display = 'none';
		userSearchResults.classList.remove('show');
		selectedUserContainer.style.display = 'none';
		newUserContainer.style.display = 'block';
		isCreatingNewUser = true;
		if (searchQuery.includes('@')) {
			newUserEmail.value = searchQuery;
			newUserName.value = '';
		} else {
			newUserName.value = searchQuery;
			newUserEmail.value = '';
		}
		userIdInput.value = '';
		newUserName.focus();
	};

	const clearUserSelection = () => {
		userIdInput.value = '';
		userSearchInput.value = '';
		userSearchInput.style.display = 'block';
		selectedUserContainer.style.display = 'none';
		newUserContainer.style.display = 'none';
		isCreatingNewUser = false;
		newUserName.value = '';
		newUserUsername.value = '';
		newUserEmail.value = '';
		newUserAge.value = '';
		newUserLocation.value = '';
		newUserNote.value = '';
		userSearchInput.focus();
	};

	userSearchInput?.addEventListener('input', (e) => {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			const results = searchUsers(e.target.value);
			renderUserSearchResults(results, e.target.value);
		}, 200);
	});

	userSearchInput?.addEventListener('focus', () => {
		const results = searchUsers(userSearchInput.value);
		renderUserSearchResults(results, userSearchInput.value);
	});

	document.addEventListener('click', (e) => {
		if (!e.target.closest('.user-search-container')) {
			userSearchResults?.classList.remove('show');
		}
	});

	clearUserBtn?.addEventListener('click', clearUserSelection);
	cancelNewUserBtn?.addEventListener('click', clearUserSelection);

	// ==================== BOOK SELECTION ====================
	const loadBooks = async () => {
		try {
			const res = await fetch('api/db.php?limit=10000');
			const data = await res.json();
			const books = data.data || data || [];
			allBooks = books.filter(b => !b.deleted_at && Number(b.is_rental) === 1 && Number(b.stock) > 0);
		} catch (e) {
			console.error('Error loading books:', e);
			allBooks = [];
		}
	};

	const renderBookSearchResults = (books) => {
		if (books.length === 0) {
			bookSearchResults.innerHTML = '<div class="text-center text-muted py-3">No books found.</div>';
			return;
		}
		bookSearchResults.innerHTML = books.map(book => {
			const isAlreadySelected = selectedBooks.some(b => b.id === book.id);
			const disabledClass = isAlreadySelected ? 'opacity-50' : '';
			const disabledAttr = isAlreadySelected ? 'style="pointer-events:none;"' : '';
			const coverCandidates = getCoverCandidates(book.cover_image);
			return `
				<div class="book-search-item d-flex align-items-center ${disabledClass}" data-book-id="${book.id}" ${disabledAttr}>
					<img src="${escapeHtml(coverCandidates[0])}" alt="${escapeHtml(book.title)}" class="me-3">
					<div class="flex-grow-1">
						<strong>${escapeHtml(book.title)}</strong><br>
						<small class="text-muted">${escapeHtml(book.author || '')} | Stock: ${book.stock}</small>
					</div>
					${isAlreadySelected ? '<span class="badge bg-secondary">Selected</span>' : ''}
				</div>
			`;
		}).join('');

		initImages(bookSearchResults);

		bookSearchResults.querySelectorAll('.book-search-item:not(.opacity-50)').forEach(item => {
			item.addEventListener('click', () => {
				const bookId = parseInt(item.dataset.bookId);
				addBookToSelection(bookId);
			});
		});
	};

	const addBookToSelection = (bookId) => {
		const book = allBooks.find(b => b.id === bookId);
		if (!book) return;
		if (selectedBooks.some(b => b.id === bookId)) {
			alert('This book is already selected.');
			return;
		}
		if (selectedBooks.length >= MAX_BOOKS) {
			alert(`Maximum ${MAX_BOOKS} books allowed per rental.`);
			return;
		}
		
		const startDate = getCurrentDateTime();
		const dueDate = document.getElementById('dueDate').value;
		const endDate = dueDate ? dueDate.replace('T', ' ') + ':00' : null;
		
		selectedBooks.push({ 
			...book, 
			quantity: 1,
			start_date: startDate,
			end_date: endDate
		});
		renderSelectedBooks();
		bookSearchModal.hide();
		updateAddBookButton();
	};

	const removeBookFromSelection = (bookId) => {
		selectedBooks = selectedBooks.filter(b => b.id !== bookId);
		renderSelectedBooks();
		updateAddBookButton();
	};

	const renderSelectedBooks = () => {
		if (selectedBooks.length === 0) {
			booksEmptyState.style.display = 'block';
			const cards = selectedBooksContainer.querySelectorAll('.book-item');
			cards.forEach(c => c.remove());
			return;
		}
		booksEmptyState.style.display = 'none';

		const dueDate = document.getElementById('dueDate').value;
		const endDate = dueDate ? dueDate.replace('T', ' ') + ':00' : null;
		selectedBooks.forEach(book => { book.end_date = endDate; });

		const canRemove = selectedBooks.length > 1;

		let html = '';
		selectedBooks.forEach((book) => {
			const start = book.start_date ? formatDate(book.start_date) : '-';
			const end = book.end_date ? formatDate(book.end_date) : '-';
			const coverCandidates = getCoverCandidates(book.cover_image);
			const dataSrcs = coverCandidates.map(u => escapeHtml(u)).join('||');
			
			html += `
				<div class="book-item" data-book-id="${book.id}">
					<button type="button" class="btn btn-sm btn-danger btn-remove" data-book-id="${book.id}" ${!canRemove ? 'disabled' : ''}>
						<i class="bi bi-x"></i>
					</button>
					<div class="row align-items-start">
						<div class="col-auto">
							<img src="${escapeHtml(coverCandidates[0])}" data-srcs="${dataSrcs}" class="book-cover-small" alt="${escapeHtml(book.title)}" onerror="imgFallback(this)">
						</div>
						<div class="col">
							<h6 class="mb-1">${escapeHtml(book.title)}</h6>
							<small class="text-muted">${escapeHtml(book.author || '')} | ISBN: ${escapeHtml(book.isbn || '')}</small><br>
							<small>Start: ${start} | End: ${end}</small>
						</div>
					</div>
				</div>
			`;
		});
		
		const existingCards = selectedBooksContainer.querySelectorAll('.book-item');
		existingCards.forEach(c => c.remove());
		booksEmptyState.insertAdjacentHTML('beforebegin', html);

		selectedBooksContainer.querySelectorAll('.btn-remove').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const bookId = parseInt(btn.dataset.bookId);
				if (selectedBooks.length <= 1) {
					alert('Cannot remove - at least 1 book is required.');
					return;
				}
				if (confirm('Remove this book?')) {
					removeBookFromSelection(bookId);
				}
			});
		});

		initImages(selectedBooksContainer);
	};

	document.getElementById('dueDate')?.addEventListener('change', () => {
		if (selectedBooks.length > 0) renderSelectedBooks();
	});

	const updateAddBookButton = () => {
		if (selectedBooks.length >= MAX_BOOKS) {
			btnAddBook.disabled = true;
			btnAddBook.textContent = `Maximum ${MAX_BOOKS} books`;
		} else {
			btnAddBook.disabled = false;
			btnAddBook.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Add Book';
		}
	};

	btnAddBook?.addEventListener('click', () => {
		if (selectedBooks.length >= MAX_BOOKS) {
			alert(`Maximum ${MAX_BOOKS} books allowed.`);
			return;
		}
		bookSearchInput.value = '';
		renderBookSearchResults(allBooks);
		bookSearchModal.show();
		setTimeout(() => bookSearchInput.focus(), 300);
	});

	bookSearchInput?.addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase().trim();
		const filtered = query 
			? allBooks.filter(b => 
				b.title?.toLowerCase().includes(query) ||
				b.author?.toLowerCase().includes(query) ||
				b.isbn?.toLowerCase().includes(query)
			)
			: allBooks;
		renderBookSearchResults(filtered);
	});

	// ==================== FORM SUBMIT ====================
	const createNewUser = async () => {
		const name = newUserName.value.trim();
		const username = newUserUsername.value.trim();
		const email = newUserEmail.value.trim();
		const age = newUserAge.value ? parseInt(newUserAge.value) : null;
		const location = newUserLocation.value.trim();
		const note = newUserNote.value.trim();

		if (!name) throw new Error('User name is required');
		if (!username) throw new Error('Username is required');
		if (!email) throw new Error('User email is required');

		const res = await fetch('api/users.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, username, email, age, location: location || null, note: note || null })
		});
		const data = await res.json();
		if (!res.ok || data.error) throw new Error(data.error || 'Failed to create user');
		return data.data || data;
	};

	form.addEventListener('submit', async (e) => {
		e.preventDefault();

		let userId = userIdInput.value;

		if (isCreatingNewUser) {
			try {
				const newUser = await createNewUser();
				userId = newUser.id;
			} catch (err) {
				alert('Error creating user: ' + err.message);
				return;
			}
		}

		if (!userId) {
			alert('Please select a user or create a new one.');
			userSearchInput?.focus();
			return;
		}

		if (selectedBooks.length === 0) {
			alert('Please add at least one book.');
			return;
		}

		const dueDate = document.getElementById('dueDate').value;
		if (!dueDate) {
			alert('Please select a due date.');
			return;
		}

		const btn = form.querySelector('button[type="submit"]');
		btn.disabled = true;
		btn.textContent = 'Creating...';

		try {
			const items = selectedBooks.map(b => ({
				book_id: b.id,
				quantity: b.quantity,
				start_date: b.start_date,
				end_date: b.end_date
			}));

			const payload = {
				user_id: parseInt(userId),
				items: items,
				due_date: dueDate.replace('T', ' ') + ':00',
				notes: document.getElementById('notes').value.trim() || null
			};

			const res = await fetch('api/rentals.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = await res.json();
			if (!res.ok || data.error) {
				throw new Error(data.error || 'Failed to create rental');
			}

			window.location.href = 'index-rental.html?created=1';
		} catch (err) {
			alert(err.message || 'An unexpected error occurred.');
		} finally {
			btn.disabled = false;
			btn.textContent = 'Create Rental';
		}
	});

	// ==================== INITIALIZE ====================
	loadUsers();
	loadBooks();
	updateAddBookButton();
})();
