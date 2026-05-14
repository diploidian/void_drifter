(function () {
    const apiUrl = (
        localStorage.getItem('void_drifter_api_url') ||
        window.VOID_DRIFTER_API_URL ||
        ''
    ).replace(/\/$/, '');

    const panel = document.getElementById('auth-panel');
    const statusEl = document.getElementById('auth-status');
    const messageEl = document.getElementById('auth-message');
    const loginBtn = document.getElementById('auth-login');
    const logoutBtn = document.getElementById('auth-logout');
    const saveBtn = document.getElementById('auth-save');
    const loadBtn = document.getElementById('auth-load');

    let currentUser = null;

    function setMessage(message) {
        messageEl.textContent = message || '';
    }

    function setState(state, text) {
        panel.dataset.authState = state;
        statusEl.textContent = text;
    }

    async function apiFetch(path, options = {}) {
        if (!apiUrl) {
            throw new Error('Set window.VOID_DRIFTER_API_URL or localStorage void_drifter_api_url first.');
        }

        const headers = options.body
            ? { 'content-type': 'application/json', ...(options.headers || {}) }
            : options.headers;

        return fetch(`${apiUrl}${path}`, {
            ...options,
            headers,
            credentials: 'include'
        });
    }

    async function refreshMe() {
        setMessage('');

        if (!apiUrl) {
            setState('missing-config', 'Backend API URL not configured');
            return;
        }

        try {
            const res = await apiFetch('/api/me');
            if (res.status === 401) {
                currentUser = null;
                setState('signed-out', 'Not signed in');
                return;
            }
            if (!res.ok) throw new Error(`Sign-in check failed (${res.status})`);

            const body = await res.json();
            currentUser = body.user;
            setState('signed-in', `Signed in as ${currentUser.email || currentUser.name}`);
        } catch (err) {
            currentUser = null;
            setState('error', 'Auth unavailable');
            setMessage(err.message);
        }
    }

    loginBtn.addEventListener('click', () => {
        if (!apiUrl) {
            setMessage('Set window.VOID_DRIFTER_API_URL or localStorage void_drifter_api_url first.');
            return;
        }
        const loginUrl = new URL(`${apiUrl}/auth/microsoft/login`);
        loginUrl.searchParams.set('return_to', window.location.href);
        window.location.href = loginUrl.toString();
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            const res = await apiFetch('/auth/logout', { method: 'POST' });
            if (!res.ok && res.status !== 204) throw new Error(`Logout failed (${res.status})`);
            currentUser = null;
            setState('signed-out', 'Not signed in');
        } catch (err) {
            setMessage(err.message);
        }
    });

    saveBtn.addEventListener('click', async () => {
        if (!currentUser) {
            setMessage('Sign in before saving.');
            return;
        }

        try {
            const save_json = window.VoidDrifterProgress.capture();
            const res = await apiFetch('/api/progress', {
                method: 'PUT',
                body: JSON.stringify({ slot: 'default', save_json })
            });
            if (!res.ok) throw new Error(`Save failed (${res.status})`);
            setMessage('Progress saved.');
        } catch (err) {
            setMessage(err.message);
        }
    });

    loadBtn.addEventListener('click', async () => {
        if (!currentUser) {
            setMessage('Sign in before loading.');
            return;
        }

        try {
            const res = await apiFetch('/api/progress?slot=default');
            if (!res.ok) throw new Error(`Load failed (${res.status})`);
            const body = await res.json();
            if (!body.save_json) {
                setMessage('No saved progress yet.');
                return;
            }
            window.VoidDrifterProgress.apply(body.save_json);
            setMessage('Progress loaded.');
        } catch (err) {
            setMessage(err.message);
        }
    });

    refreshMe();
})();
