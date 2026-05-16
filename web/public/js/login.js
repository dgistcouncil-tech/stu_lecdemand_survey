// Login page functionality

document.addEventListener('DOMContentLoaded', async () => {
    // If already logged in, redirect away from login page
    const user = await checkAuth();
    if (user) {
        window.location.href = user.is_submitted ? '/result.html' : '/index.html';
        return;
    }

    const form = document.getElementById('loginForm');
    const additionalFields = document.getElementById('additionalFields');
    const majorSelect = document.getElementById('major');
    const minorSelect = document.getElementById('minor');

    // Check for error query parameter on load (inline message only, no alert on refresh)
    const urlParams = new URLSearchParams(window.location.search);
    const errorCode = urlParams.get('error');
    const isNewUser = urlParams.get('new_user');

    if (errorCode) {
        if (errorCode === 'already_exists') {
            alert('이미 가입된 학번입니다.');
        }

        let errorMsg = '로그인 중 오류가 발생했습니다.';
        if (errorCode === 'already_exists') {
            errorMsg = '이미 가입된 학번입니다.';
        } else if (errorCode === 'invalid_name' || errorCode === 'invalid_password') {
            errorMsg = '이름 혹은 비밀번호를 잘못 입력하셨습니다.';
        } else if (errorCode === 'missing_fields') {
            errorMsg = '학번, 성함, 비밀번호를 모두 입력해주세요.';
        }
        showError('errorMessage', errorMsg);
    } else if (isNewUser === 'true') {
        additionalFields.style.display = 'block';
        showError('errorMessage', '신규 사용자입니다. 추가 정보를 입력하고 다시 제출해주세요.');
    }

    // Clear query parameters from URL without refreshing
    if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const TRACKS = Array.from(majorSelect.options)
        .filter(o => o.value)
        .map(o => o.value);

    // Rebuild minor options each time major changes, excluding the selected major
    function rebuildMinorOptions() {
        const selectedMajor = majorSelect.value;
        const currentMinor = minorSelect.value;

        minorSelect.innerHTML = '<option value="">선택하세요</option>';
        TRACKS.forEach(track => {
            if (track === selectedMajor) return;
            const opt = document.createElement('option');
            opt.value = track;
            opt.textContent = track;
            if (track === currentMinor) opt.selected = true;
            minorSelect.appendChild(opt);
        });
    }

    majorSelect.addEventListener('change', rebuildMinorOptions);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('errorMessage');

        const formData = {
            student_id: document.getElementById('studentId').value.trim(),
            name: document.getElementById('name').value.trim(),
            password: document.getElementById('password').value,
            is_registration: additionalFields.style.display !== 'none',
        };

        if (!formData.student_id || !formData.name || !formData.password) {
            showError('errorMessage', '학번, 성함, 비밀번호를 모두 입력해주세요.');
            return;
        }

        // Include additional fields if they are visible
        if (additionalFields.style.display !== 'none') {
            formData.major = majorSelect.value;
            formData.minor = minorSelect.value;
            formData.current_year = document.getElementById('currentYear').value;
            formData.special_notes = document.getElementById('specialNotes').value.trim();
        }

        try {
            const data = await apiRequest('/api/login', {
                method: 'POST',
                body: JSON.stringify(formData),
            });

            if (data.is_new_user && additionalFields.style.display === 'none') {
                // First attempt by a new user — reveal the extra fields
                additionalFields.style.display = 'block';
                showError('errorMessage', '신규 사용자입니다. 추가 정보를 입력하고 다시 제출해주세요.');
                return;
            }

            // Login successful → redirect
            if (data.student.is_submitted) {
                window.location.href = '/result.html';
            } else {
                window.location.href = '/index.html';
            }
        } catch (error) {
            const msg = error.message || '';
            if (msg.includes('Already registered student ID')) {
                alert('이미 가입된 학번입니다.');
                form.reset();
                additionalFields.style.display = 'none';
            } else if (msg.includes('Invalid name') || msg.includes('Invalid password')) {
                alert('이름 혹은 비밀번호를 잘못 입력하셨습니다.');
                form.reset();
                additionalFields.style.display = 'none';
            } else {
                showError('errorMessage', '로그인 중 오류가 발생했습니다: ' + msg);
            }
        }
    });
});
