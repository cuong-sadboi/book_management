// Check authentication on protected pages
(function() {
	const AUTH_KEY = 'book_management_auth';
	const PUBLIC_PAGES = ['login.html', 'register.html'];
	
	const getAuth = () => {
		try {
			return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
		} catch {
			return null;
		}
	};
	
	const getCurrentPage = () => {
		return window.location.pathname.split('/').pop() || 'index.html';
	};
	
	const isPublicPage = () => {
		const currentPage = getCurrentPage();
		return PUBLIC_PAGES.includes(currentPage);
	};
	
	// Check auth and redirect if needed
	const checkAuth = () => {
		const auth = getAuth();
		const currentPage = getCurrentPage();
		
		// If not logged in and trying to access protected page
		if (!auth && !isPublicPage()) {
			window.location.href = 'login.html';
			return false;
		}
		
		// If logged in and trying to access login page
		if (auth && currentPage === 'login.html') {
			window.location.href = 'dashboard.html';
			return false;
		}
		
		return true;
	};
	
	// Run check immediately
	checkAuth();
	
	// Export for global use
	window.BookAuth = window.BookAuth || {};
	window.BookAuth.checkAuth = checkAuth;
	window.BookAuth.getAuth = getAuth;
	window.BookAuth.isLoggedIn = () => getAuth() !== null;
})();
