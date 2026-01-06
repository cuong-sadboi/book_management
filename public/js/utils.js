/**
 * Common utility functions for Book Management System
 */

// Escape HTML to prevent XSS
const escapeHtml = (value = '') =>
    value.toString().replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));

// Currency formatter for Vietnamese Dong
const currencyFormatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
});

// Format date for display - Vietnam timezone
const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
    });
};

// Get current datetime in Vietnam timezone (for datetime-local input)
const getVietnamDateTimeLocal = (addDays = 0) => {
    const now = new Date();
    const vnOptions = {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const parts = new Intl.DateTimeFormat('en-CA', vnOptions).formatToParts(now);

    let year = '', month = '', day = '', hour = '', minute = '';
    parts.forEach(p => {
        if (p.type === 'year') year = p.value;
        if (p.type === 'month') month = p.value;
        if (p.type === 'day') day = p.value;
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
    });

    let vnDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
    if (addDays !== 0) {
        vnDate.setDate(vnDate.getDate() + addDays);
    }

    const y = vnDate.getFullYear();
    const m = String(vnDate.getMonth() + 1).padStart(2, '0');
    const d = String(vnDate.getDate()).padStart(2, '0');
    const h = String(vnDate.getHours()).padStart(2, '0');
    const min = String(vnDate.getMinutes()).padStart(2, '0');

    return `${y}-${m}-${d}T${h}:${min}`;
};

// Get current datetime string for database (Y-m-d H:i:s)
const getVietnamDateTime = () => {
    const now = new Date();
    const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = vnTime.getFullYear();
    const month = String(vnTime.getMonth() + 1).padStart(2, '0');
    const day = String(vnTime.getDate()).padStart(2, '0');
    const hours = String(vnTime.getHours()).padStart(2, '0');
    const minutes = String(vnTime.getMinutes()).padStart(2, '0');
    const seconds = String(vnTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Cover image candidates helper
const getCoverCandidates = (cover) => {
    const placeholder = 'https://via.placeholder.com/80x110?text=No+Cover';
    const p = window.location.pathname;
    const idx = p.indexOf('/public/');
    const baseRoot = idx !== -1 ? p.substring(0, idx) : '';
    const rootPrefix = window.location.origin + baseRoot;

    if (!cover) return [placeholder];
    const s = String(cover).trim();
    const c = [];
    if (/^https?:\/\//i.test(s)) {
        c.push(s);
    } else if (s.startsWith('//')) {
        c.push(window.location.protocol + s);
    } else {
        const raw = s.replace(/^\/+/, '');
        const patterns = [
            `${rootPrefix}/public/${raw}`,
            `${rootPrefix}/${raw}`,
            `${window.location.origin}/public/${raw}`,
            `${window.location.origin}/${raw}`,
            `${rootPrefix}/public/uploads/books/${raw}`,
            `${rootPrefix}/public/uploads/${raw}`,
            `${rootPrefix}/uploads/books/${raw}`,
            `${rootPrefix}/uploads/${raw}`,
            `${window.location.origin}/uploads/books/${raw}`,
            `${window.location.origin}/uploads/${raw}`,
            `./${raw}`,
            `../${raw}`
        ];
        patterns.forEach(u => {
            try {
                c.push(encodeURI(u.replace(/([^:]\/)\/+/g, '$1')));
            } catch (e) {
                c.push(u.replace(/([^:]\/)\/+/g, '$1'));
            }
        });
    }
    c.push(placeholder);
    return Array.from(new Set(c.filter(Boolean)));
};

// Image fallback handler
window.imgFallback = function(img) {
    try {
        const list = (img.dataset.srcs || '').split('||').filter(Boolean);
        let idx = parseInt(img.dataset.srcIdx || '0', 10);
        idx++;
        if (idx < list.length) {
            img.src = list[idx];
            img.dataset.srcIdx = String(idx);
        } else {
            img.onerror = null;
        }
    } catch (e) {
        img.onerror = null;
    }
};

// Initialize images with fallback
const initImages = (root = document) => {
    (root.querySelectorAll ? root.querySelectorAll('img[data-srcs]') : []).forEach(img => {
        const list = (img.dataset.srcs || '').split('||').filter(Boolean);
        if (!list.length) return;
        img.dataset.srcIdx = '0';
        img.src = list[0];
        if (!img.onerror) img.onerror = function() { window.imgFallback(this); };
    });
};

// Status badge helper for rentals
const getStatusBadge = (status) => {
    const badges = {
        'active': '<span class="badge bg-success">Active</span>',
        'returned': '<span class="badge bg-secondary">Returned</span>',
        'overdue': '<span class="badge bg-danger">Overdue</span>'
    };
    return badges[status] || status;
};

// LocalStorage helpers for hidden IDs
const getHiddenIds = (key) => {
    try {
        return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String));
    } catch {
        return new Set();
    }
};

const setHiddenIds = (key, set) => {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
};

// Include HTML loader
const loadIncludes = () => {
    document.querySelectorAll('[data-include]').forEach((node) => {
        fetch(node.dataset.include)
            .then((res) => (res.ok ? res.text() : Promise.reject(res.statusText)))
            .then((html) => {
                node.innerHTML = html;
                window.initLayout?.();
            })
            .catch(() => {
                node.innerHTML = '<div class="alert alert-warning m-0">Unable to load layout section.</div>';
            });
    });
};

// Auto-load includes on DOMContentLoaded
document.addEventListener('DOMContentLoaded', loadIncludes);

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        currencyFormatter,
        formatDate,
        getVietnamDateTimeLocal,
        getVietnamDateTime,
        getCoverCandidates,
        initImages,
        getStatusBadge,
        getHiddenIds,
        setHiddenIds,
        loadIncludes
    };
}
