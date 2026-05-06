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

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('errorMessage');

        const formData = {
            student_id: document.getElementById('studentId').value.trim(),
            name: document.getElementById('name').value.trim(),
            password: document.getElementById('password').value,
        };

        if (!formData.student_id || !formData.name || !formData.password) {
            showError('errorMessage', '학번, 성함, 비밀번호를 모두 입력해주세요.');
            return;
        }

        // Include additional fields if they are visible
        if (additionalFields.style.display !== 'none') {
            formData.major = document.getElementById('major').value;
            formData.minor = document.getElementById('minor').value;
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
            if (msg.includes('Invalid password')) {
                showError('errorMessage', '비밀번호가 일치하지 않습니다.');
            } else {
                showError('errorMessage', '로그인 중 오류가 발생했습니다: ' + msg);
            }
        }
    });
});
