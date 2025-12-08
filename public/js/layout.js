(() => {
  const mobileQuery = window.matchMedia('(max-width: 991.98px)');

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-mobile-open');
  }

  function toggleSidebar() {
    if (mobileQuery.matches) {
      document.body.classList.toggle('sidebar-mobile-open');
    } else {
      document.body.classList.toggle('sidebar-hidden');
    }
  }

  function bindEvents() {
    const toggleBtn = document.getElementById('sidebarToggle');
    if (toggleBtn && !toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = 'true';
      toggleBtn.addEventListener('click', toggleSidebar);
    }

    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = 'true';
      backdrop.addEventListener('click', closeMobileSidebar);
    }

    document.querySelectorAll('.sidebar a').forEach((link) => {
      if (link.dataset.bound) return;
      link.dataset.bound = 'true';
      link.addEventListener('click', () => mobileQuery.matches && closeMobileSidebar());
    });

    document.querySelectorAll('.sidebar__toggle').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-submenu-target');
        const submenu = targetId && document.getElementById(targetId);
        if (!submenu) return;
        const isOpen = submenu.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', () => !mobileQuery.matches && closeMobileSidebar());
  } else {
    mobileQuery.addListener(() => !mobileQuery.matches && closeMobileSidebar());
  }

  window.initLayout = bindEvents;
  document.addEventListener('DOMContentLoaded', bindEvents);
})();
