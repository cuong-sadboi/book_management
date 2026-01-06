(() => {
	const formatTimeAgo = (dateStr) => {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		const now = new Date();
		const diffMs = now - d;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} minutes ago`;
		if (diffHours < 24) return `${diffHours} hours ago`;
		if (diffDays < 7) return `${diffDays} days ago`;
		return formatDate(dateStr);
	};

	// Counter animation function
	const animateCounter = (element, target, duration = 1000) => {
		if (!element) return;
		const start = 0;
		const increment = target / (duration / 16);
		let current = start;
		
		const timer = setInterval(() => {
			current += increment;
			if (current >= target) {
				element.textContent = Math.round(target);
				clearInterval(timer);
			} else {
				element.textContent = Math.round(current);
			}
		}, 16);
	};

	// Animate progress bar
	const animateProgressBar = (element, targetWidth, duration = 1000) => {
		if (!element) return;
		let currentWidth = 0;
		const increment = targetWidth / (duration / 16);
		
		const timer = setInterval(() => {
			currentWidth += increment;
			if (currentWidth >= targetWidth) {
				element.style.width = `${targetWidth}%`;
				clearInterval(timer);
			} else {
				element.style.width = `${currentWidth}%`;
			}
		}, 16);
	};

	// Load Statistics
	const loadStats = async () => {
		try {
			// Load books stats
			let totalBooks = 0, totalStock = 0;
			try {
				const booksRes = await fetch('api/db.php?limit=10000');
				if (booksRes.ok) {
					const booksData = await booksRes.json();
					let books = booksData.data || booksData || [];
					if (!Array.isArray(books)) books = [];
					
					const hiddenIds = getHiddenIds('book_hidden_ids');
					const filteredBooks = books.filter(b => !hiddenIds.has(String(b.id ?? '')));
					
					totalBooks = filteredBooks.length;
					totalStock = filteredBooks.reduce((sum, b) => sum + (parseInt(b.stock) || 0), 0);
				}
			} catch (e) { console.error('Books API error:', e); }
			
			animateCounter(document.getElementById('totalBooks'), totalBooks);
			animateCounter(document.getElementById('totalStock'), totalStock);

			// Load genres stats
			let totalCategories = 0;
			try {
				const genresRes = await fetch('api/genres.php?per_page=10000');
				if (genresRes.ok) {
					const genresData = await genresRes.json();
					let genres = genresData.data || genresData || [];
					if (!Array.isArray(genres)) genres = [];
					totalCategories = genres.filter(g => !g.deleted_at).length;
				}
			} catch (e) { console.error('Genres API error:', e); }
			animateCounter(document.getElementById('totalCategories'), totalCategories);

			// Load authors stats
			let totalAuthors = 0;
			try {
				const authorsRes = await fetch('api/authors.php?per_page=10000');
				if (authorsRes.ok) {
					const authorsData = await authorsRes.json();
					let authors = authorsData.data || authorsData || [];
					if (!Array.isArray(authors)) authors = [];
					totalAuthors = authors.filter(a => !a.deleted_at).length;
				}
			} catch (e) { console.error('Authors API error:', e); }
			animateCounter(document.getElementById('totalAuthors'), totalAuthors);

			// Load publishers stats
			let totalPublishers = 0;
			try {
				const publishersRes = await fetch('api/publishers.php?per_page=10000');
				if (publishersRes.ok) {
					const publishersData = await publishersRes.json();
					let publishers = publishersData.data || publishersData || [];
					if (!Array.isArray(publishers)) publishers = [];
					totalPublishers = publishers.filter(p => !p.deleted_at).length;
				}
			} catch (e) { console.error('Publishers API error:', e); }
			animateCounter(document.getElementById('totalPublishers'), totalPublishers);

			// Load users stats
			let totalUsers = 0;
			try {
				const usersRes = await fetch('api/users.php?per_page=10000');
				if (usersRes.ok) {
					const usersData = await usersRes.json();
					let users = usersData.data || usersData || [];
					if (!Array.isArray(users)) users = [];
					totalUsers = users.filter(u => !u.deleted_at).length;
				}
			} catch (e) { console.error('Users API error:', e); }
			animateCounter(document.getElementById('totalUsers'), totalUsers);

			// Load rentals stats
			let totalRentals = 0, activeRentals = 0, overdueRentals = 0, returnedRentals = 0;
			let booksBeingRented = 0;
			try {
				const rentalsRes = await fetch('api/rentals.php?per_page=10000');
				if (rentalsRes.ok) {
					const rentalsData = await rentalsRes.json();
					let rentals = rentalsData.data || rentalsData || [];
					if (!Array.isArray(rentals)) rentals = [];
					const filteredRentals = rentals.filter(r => !r.deleted_at);
					totalRentals = filteredRentals.length;
					activeRentals = filteredRentals.filter(r => r.status === 'active').length;
					overdueRentals = filteredRentals.filter(r => r.status === 'overdue').length;
					returnedRentals = filteredRentals.filter(r => r.status === 'returned').length;
					
					filteredRentals.forEach(r => {
						if (r.status === 'active' || r.status === 'overdue') {
							if (Array.isArray(r.items)) {
								r.items.forEach(item => {
									booksBeingRented += parseInt(item.quantity) || 1;
								});
							} else {
								booksBeingRented += 1;
							}
						}
					});
				}
			} catch (e) { console.error('Rentals API error:', e); }

			animateCounter(document.getElementById('totalRentals'), totalRentals);
			animateCounter(document.getElementById('activeRentals'), activeRentals);
			animateCounter(document.getElementById('overdueRentals'), overdueRentals);
			animateCounter(document.getElementById('returnedRentals'), returnedRentals);
			
			animateCounter(document.getElementById('rentalBooks'), booksBeingRented);
			animateCounter(document.getElementById('saleBooks'), Math.max(0, totalStock - booksBeingRented));

			document.getElementById('totalRentalsForActive').textContent = totalRentals;
			document.getElementById('totalRentalsForOverdue').textContent = totalRentals;
			document.getElementById('totalRentalsForReturned').textContent = totalRentals;

			// Animate progress bars
			if (totalRentals > 0) {
				animateProgressBar(document.getElementById('activeProgress'), (activeRentals / totalRentals) * 100);
				animateProgressBar(document.getElementById('overdueProgress'), (overdueRentals / totalRentals) * 100);
				animateProgressBar(document.getElementById('returnedProgress'), (returnedRentals / totalRentals) * 100);
			}

			// Show overdue alert
			const overdueAlert = document.getElementById('overdueAlert');
			if (overdueRentals > 0) {
				document.getElementById('overdueCount').textContent = overdueRentals;
				overdueAlert.classList.remove('d-none');
			} else {
				overdueAlert.classList.add('d-none');
			}

		} catch (error) {
			console.error('Error loading stats:', error);
		}
	};

	// Load Top Most Rented Books
	const loadTopRentedBooks = async () => {
		const topBooksTable = document.getElementById('topBooksTable');
		if (!topBooksTable) return;
		
		try {
			const rentalsRes = await fetch('api/rentals.php?per_page=10000');
			if (!rentalsRes.ok) throw new Error('Failed to fetch rentals');
			
			const rentalsData = await rentalsRes.json();
			let rentals = rentalsData.data || rentalsData || [];
			if (!Array.isArray(rentals)) rentals = [];
			const filteredRentals = rentals.filter(r => !r.deleted_at);

			const bookRentalCount = {};
			const bookIds = new Set();
			
			filteredRentals.forEach(rental => {
				if (Array.isArray(rental.items)) {
					rental.items.forEach(item => {
						const bookId = item.book_id;
						if (!bookId) return;
						bookRentalCount[bookId] = (bookRentalCount[bookId] || 0) + 1;
						bookIds.add(bookId);
					});
				}
			});

			const booksInfo = {};
			await Promise.all(
				Array.from(bookIds).map(async (bookId) => {
					try {
						const bookRes = await fetch(`api/books.php?id=${encodeURIComponent(bookId)}`);
						if (bookRes.ok) {
							const bookData = await bookRes.json();
							const book = bookData?.data ?? bookData;
							if (book) {
								booksInfo[bookId] = {
									title: book.title || 'Unknown',
									author: book.author || 'Unknown',
									currentlyRenting: 0
								};
							}
						}
					} catch (e) {
						console.warn(`Failed to fetch book ${bookId}:`, e);
					}
				})
			);

			filteredRentals.forEach(rental => {
				if (rental.status === 'active' || rental.status === 'overdue') {
					if (Array.isArray(rental.items)) {
						rental.items.forEach(item => {
							const bookId = item.book_id;
							if (bookId && booksInfo[bookId]) {
								booksInfo[bookId].currentlyRenting += parseInt(item.quantity) || 1;
							}
						});
					}
				}
			});

			const topBooks = Object.entries(bookRentalCount)
				.map(([bookId, count]) => ({
					bookId,
					count,
					...(booksInfo[bookId] || { title: 'Unknown', author: 'Unknown', currentlyRenting: 0 })
				}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			if (topBooks.length === 0) {
				topBooksTable.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No rental data available.</td></tr>';
				return;
			}

			topBooksTable.innerHTML = topBooks.map((book, index) => {
				const badgeClass = index === 0 ? 'bg-warning' : index === 1 ? 'bg-secondary' : index === 2 ? 'bg-info' : 'bg-light text-dark';
				const rentingBadge = book.currentlyRenting > 0 
					? `<span class="badge bg-success">${book.currentlyRenting}</span>` 
					: '<span class="text-muted">-</span>';
				
				return `
					<tr style="cursor: pointer;" data-book-id="${book.bookId}" title="Click to view book details">
						<td class="text-center"><span class="badge ${badgeClass}">${index + 1}</span></td>
						<td><div class="fw-semibold">${escapeHtml(book.title)}</div></td>
						<td>${escapeHtml(book.author)}</td>
						<td class="text-center"><span class="badge bg-primary">${book.count}</span></td>
						<td class="text-center">${rentingBadge}</td>
					</tr>
				`;
			}).join('');

			topBooksTable.querySelectorAll('tr[data-book-id]').forEach(row => {
				row.addEventListener('click', () => {
					const bookId = row.dataset.bookId;
					if (bookId) window.location.href = `details.html?id=${encodeURIComponent(bookId)}`;
				});
			});

		} catch (error) {
			console.error('Error loading top rented books:', error);
			topBooksTable.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Error loading data.</td></tr>';
		}
	};

	// Load Recent Activities
	const loadActivities = async () => {
		const activitiesList = document.getElementById('activitiesList');
		if (!activitiesList) return;
		
		try {
			const rentalsRes = await fetch('api/rentals.php?per_page=50');
			if (!rentalsRes.ok) throw new Error('Failed to fetch rentals');
			
			const rentalsData = await rentalsRes.json();
			let rentals = rentalsData.data || rentalsData || [];
			if (!Array.isArray(rentals)) rentals = [];
			const filteredRentals = rentals.filter(r => !r.deleted_at);

			if (filteredRentals.length === 0) {
				activitiesList.innerHTML = '<div class="text-center text-muted py-4">No activities yet.</div>';
				return;
			}

			const activities = [];

			filteredRentals.forEach(rental => {
				if (rental.rental_date) {
					activities.push({ type: 'rental_created', date: rental.rental_date, rental });
				}
				if (rental.status === 'returned' && rental.return_date) {
					activities.push({ type: 'rental_returned', date: rental.return_date, rental });
				}
				if (rental.status === 'overdue') {
					activities.push({ type: 'rental_overdue', date: rental.due_date, rental });
				}
			});

			activities.sort((a, b) => new Date(b.date) - new Date(a.date));
			const recentActivities = activities.slice(0, 15);

			if (recentActivities.length === 0) {
				activitiesList.innerHTML = '<div class="text-center text-muted py-4">No activities yet.</div>';
				return;
			}

			const getActivityIcon = (type) => {
				const icons = {
					'rental_created': { bg: 'bg-success', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>' },
					'rental_returned': { bg: 'bg-secondary', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.854 8.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L7.5 10.793l2.646-2.647a.5.5 0 0 1 .708 0z"/><path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1zm3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4h-3.5zM2 5h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>' },
					'rental_overdue': { bg: 'bg-danger', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>' }
				};
				return icons[type] || { bg: 'bg-primary', icon: '' };
			};

			const getActivityText = (activity) => {
				const userName = escapeHtml(activity.rental.user_name || 'Unknown');
				const bookTitles = escapeHtml(activity.rental.book_titles || 'Unknown');
				
				switch (activity.type) {
					case 'rental_created': return `<strong>${userName}</strong> rented <em>${bookTitles}</em>`;
					case 'rental_returned': return `<strong>${userName}</strong> returned <em>${bookTitles}</em>`;
					case 'rental_overdue': return `<strong>${userName}</strong>'s rental is overdue (<em>${bookTitles}</em>)`;
					default: return 'Unknown activity';
				}
			};

			activitiesList.innerHTML = recentActivities.map(activity => {
				const iconData = getActivityIcon(activity.type);
				return `
					<div class="activity-item d-flex align-items-start">
						<div class="activity-icon ${iconData.bg} bg-opacity-10 text-${iconData.bg.replace('bg-', '')} me-3">${iconData.icon}</div>
						<div class="flex-grow-1">
							<div class="small">${getActivityText(activity)}</div>
							<div class="activity-time">${formatTimeAgo(activity.date)}</div>
						</div>
					</div>
				`;
			}).join('');

		} catch (error) {
			console.error('Error loading activities:', error);
			activitiesList.innerHTML = '<div class="text-center text-danger py-4">Error loading activities.</div>';
		}
	};

	// Toggle Activities Panel
	const toggleBtn = document.getElementById('toggleActivitiesPanel');
	const closeBtn = document.getElementById('closeActivitiesPanel');
	const activitiesPanel = document.getElementById('activitiesPanel');
	const activitiesBackdrop = document.getElementById('activitiesBackdrop');
	
	const openActivitiesPanel = () => {
		activitiesPanel?.classList.add('show');
		activitiesBackdrop?.classList.add('show');
		document.body.style.overflow = 'hidden';
	};
	
	const closeActivitiesPanel = () => {
		activitiesPanel?.classList.remove('show');
		activitiesBackdrop?.classList.remove('show');
		document.body.style.overflow = '';
	};
	
	toggleBtn?.addEventListener('click', () => {
		activitiesPanel?.classList.contains('show') ? closeActivitiesPanel() : openActivitiesPanel();
	});
	
	closeBtn?.addEventListener('click', closeActivitiesPanel);
	activitiesBackdrop?.addEventListener('click', closeActivitiesPanel);

	// Refresh button
	document.getElementById('refreshActivities')?.addEventListener('click', () => {
		const activitiesList = document.getElementById('activitiesList');
		if (activitiesList) {
			activitiesList.innerHTML = '<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Loading...</div>';
		}
		loadStats();
		loadActivities();
		loadTopRentedBooks();
	});

	// Handle stat card clicks
	document.querySelectorAll('.stat-card[data-href]').forEach(card => {
		card.addEventListener('click', () => {
			const href = card.dataset.href;
			if (href) window.location.href = href;
		});
	});

	// Initial load
	loadStats();
	loadActivities();
	loadTopRentedBooks();

	// Auto refresh every 30 seconds
	setInterval(() => {
		loadStats();
		loadActivities();
		loadTopRentedBooks();
	}, 30000);
})();
