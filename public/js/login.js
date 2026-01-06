(() => {
	const AUTH_KEY = 'book_management_auth';
	
	// Check if already logged in
	const auth = localStorage.getItem(AUTH_KEY);
	if (auth) {
		window.location.href = 'dashboard.html';
		return;
	}
	
	const form = document.getElementById('loginForm');
	const errorEl = document.getElementById('loginError');
	
	if (!form) return;
	
	// Demo users
	const demoUsers = [
		{ email: 'admin@gmail.com', password: 'admin123', name: 'Admin', role: 'admin' },
		{ email: 'staff@gmail.com', password: 'staff123', name: 'Staff', role: 'staff' }
	];
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		const email = document.getElementById('email').value.trim();
		const password = document.getElementById('password').value;
		
		errorEl.classList.add('d-none');
		
		const submitBtn = form.querySelector('button[type="submit"]');
		const originalHTML = submitBtn.innerHTML;
		submitBtn.disabled = true;
		submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';
		
		try {
			await new Promise(resolve => setTimeout(resolve, 800));
			
			const user = demoUsers.find(u => u.email === email && u.password === password);
			
			if (user) {
				const authData = {
					email: user.email,
					name: user.name,
					role: user.role,
					loginTime: new Date().toISOString()
				};
				localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
				
				setTimeout(() => {
					window.location.href = 'dashboard.html';
				}, 500);
			} else {
				throw new Error('Invalid email or password');
			}
		} catch (error) {
			errorEl.textContent = error.message;
			errorEl.classList.remove('d-none');
			submitBtn.disabled = false;
			submitBtn.innerHTML = originalHTML;
		}
	});
})();
