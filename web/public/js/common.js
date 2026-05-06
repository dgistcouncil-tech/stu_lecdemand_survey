// Common utility functions

// API request helper (cookie-based session)
async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

// Show error message
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

// Hide error message
function hideError(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.style.display = 'none';
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Check if user is authenticated (cookie-based)
async function checkAuth() {
    try {
        const response = await fetch('/api/me', {
            credentials: 'include',
        });

        if (response.status === 401) {
            return null;
        }

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        return null;
    }
}

// Redirect to login if not authenticated
async function requireAuth() {
    const user = await checkAuth();
    if (!user) {
        window.location.href = '/login.html';
        return null;
    }
    return user;
}

// Logout
async function logout() {
    try {
        await apiRequest('/api/logout', { method: 'POST' });
    } catch (error) {
        // ignore server errors on logout
    } finally {
        window.location.href = '/login.html';
    }
}

// Modal helper functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Setup modal close buttons
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
});
