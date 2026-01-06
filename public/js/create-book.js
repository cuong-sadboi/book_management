(() => {
	// Load authors into the select
	const authorSelect = document.getElementById('author');
	if (authorSelect) {
		const setAuthorOptions = (items) => {
			authorSelect.innerHTML = '<option value="">-- Select author --</option>';
			if (!items.length) return;
			const frag = document.createDocumentFragment();
			items.forEach((a) => {
				const opt = document.createElement('option');
				opt.value = a.name;
				opt.textContent = a.name;
				frag.appendChild(opt);
			});
			authorSelect.appendChild(frag);
		};

		fetch('api/authors.php?per_page=1000')
			.then((res) => res.json().then((data) => ({ ok: res.ok, data })))
			.then(({ ok, data }) => {
				setAuthorOptions(data.data ?? []);
			})
			.catch(() => setAuthorOptions([]));
	}

	// Load publishers into the select
	const publisherSelect = document.getElementById('publisher');
	if (publisherSelect) {
		const setPublisherOptions = (items) => {
			publisherSelect.innerHTML = '<option value="">-- Select publisher --</option>';
			if (!items.length) return;
			const frag = document.createDocumentFragment();
			items.forEach((p) => {
				const opt = document.createElement('option');
				opt.value = p.name;
				opt.textContent = p.name;
				frag.appendChild(opt);
			});
			publisherSelect.appendChild(frag);
		};

		fetch('api/publishers.php?per_page=1000')
			.then((res) => res.json().then((data) => ({ ok: res.ok, data })))
			.then(({ ok, data }) => {
				setPublisherOptions(data.data ?? []);
			})
			.catch(() => setPublisherOptions([]));
	}

	// Load genres into the select
	const genreSelect = document.getElementById('genre');
	if (genreSelect) {
		const setGenreOptions = (items) => {
			genreSelect.innerHTML = '<option value="">-- Select genre --</option>';
			if (!items.length) return;
			const frag = document.createDocumentFragment();
			items.forEach((g) => {
				const opt = document.createElement('option');
				opt.value = g.name;
				opt.textContent = g.name;
				frag.appendChild(opt);
			});
			genreSelect.appendChild(frag);
		};

		fetch('api/genres.php?per_page=1000')
			.then((res) => res.json().then((data) => ({ ok: res.ok, data })))
			.then(({ ok, data }) => {
				setGenreOptions(data.data ?? []);
			})
			.catch(() => setGenreOptions([]));
	}

	// Cover preview
	const fileInput = document.getElementById('cover_image');
	const thumb = document.getElementById('coverThumb');
	if (fileInput && thumb) {
		let objectUrl;
		fileInput.addEventListener('change', () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
				objectUrl = null;
			}
			const file = fileInput.files[0];
			if (file) {
				objectUrl = URL.createObjectURL(file);
				thumb.src = objectUrl;
				thumb.classList.remove('d-none');
			} else {
				thumb.src = '';
				thumb.classList.add('d-none');
			}
		});
	}

	// Form submit
	const form = document.getElementById('bookForm');
	if (form) {
		form.addEventListener('submit', async (event) => {
			event.preventDefault();
			const btn = form.querySelector('button[type="submit"]');
			const original = btn.textContent;
			btn.disabled = true;
			btn.textContent = 'Saving...';

			try {
				const formData = new FormData(form);
				const res = await fetch('api/books/create.php', {
					method: 'POST',
					body: formData,
				});
				const data = await res.json();
				if (!res.ok || data?.error) {
					throw new Error(data?.error || 'Unable to save.');
				}
				window.location.href = 'index.html?created=1';
			} catch (err) {
				alert(err.message || 'An unexpected error occurred.');
			} finally {
				btn.disabled = false;
				btn.textContent = original;
			}
		});
	}
})();
