// Main page functionality

let currentStudent = null;
let allCourses = [];
let mySelections = [];
let selectedCourseForModal = null;
let selectedParentSelectionForAlt = null;
let selectedAltCourse = null;

const PAGE_SIZE = 10;
let currentOffset = 0;
let currentTotal = 0;

document.addEventListener('DOMContentLoaded', async () => {
    currentStudent = await requireAuth();
    if (!currentStudent) return;

    if (currentStudent.is_submitted) {
        window.location.href = '/result.html';
        return;
    }

    // Display student info
    document.getElementById('studentName').textContent = currentStudent.name;
    document.getElementById('studentId').textContent = currentStudent.student_id;
    document.getElementById('studentMajor').textContent = currentStudent.major || '-';

    await loadCourseFilters();

    // Setup event listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('searchBtn').addEventListener('click', () => searchCourses(true));
    document.getElementById('submitBtn').addEventListener('click', submitSurvey);

    // Search on Enter key
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCourses(true);
        }
    });

    // Modal event listeners
    setupModalListeners();

    // Load initial data
    await loadMySelections();

    // Initial search
    await searchCourses(true);
});

async function loadCourseFilters() {
    try {
        const data = await apiRequest('/api/course-filters');
        const divisions = (data.divisions || []).filter(Boolean);
        const fields = (data.fields || []).filter(Boolean);

        const divisionSelect = document.getElementById('filterDivision');
        const fieldSelect = document.getElementById('filterField');

        if (divisionSelect) {
            const current = divisionSelect.value;
            divisionSelect.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = '전체';
            divisionSelect.appendChild(allOpt);
            divisions.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                divisionSelect.appendChild(opt);
            });
            if (current && divisions.includes(current)) {
                divisionSelect.value = current;
            }
        }

        if (fieldSelect) {
            const current = fieldSelect.value;
            fieldSelect.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = '전체';
            fieldSelect.appendChild(allOpt);
            fields.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                fieldSelect.appendChild(opt);
            });
            if (current && fields.includes(current)) {
                fieldSelect.value = current;
            }
        }
    } catch (e) {
        // ignore; filters will still work if user types search
    }
}

async function searchCourses(resetPage = false) {
    if (resetPage) {
        currentOffset = 0;
    }

    const division = document.getElementById('filterDivision').value;
    const field = document.getElementById('filterField').value;
    const search = document.getElementById('searchInput').value.trim();

    const params = new URLSearchParams();
    if (division) params.append('division', division);
    if (field) params.append('field', field);
    if (search) params.append('search', search);
    params.append('limit', String(PAGE_SIZE));
    params.append('offset', String(currentOffset));

    try {
        const data = await apiRequest(`/api/courses?${params.toString()}`);
        allCourses = data.courses || [];
        currentTotal = typeof data.total === 'number' ? data.total : allCourses.length;
        renderCourseTable(allCourses, currentOffset);
        renderPagination(currentTotal, currentOffset, PAGE_SIZE);
    } catch (error) {
        alert('강좌 조회 중 오류가 발생했습니다: ' + error.message);
    }
}

function renderCourseTable(courses, offset = 0) {
    const tbody = document.getElementById('courseTableBody');

    if (courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">조회 결과가 없습니다</td></tr>';
        return;
    }

    // Get selected course IDs
    const selectedCourseIds = new Set(
        mySelections.flatMap(sel => {
            const ids = [sel.course_id];
            if (sel.alternatives) {
                ids.push(...sel.alternatives.map(alt => alt.course_id));
            }
            return ids;
        })
    );

    tbody.innerHTML = courses.map((course, index) => {
        const isSelected = selectedCourseIds.has(course.id);
        const rowClass = isSelected ? 'course-disabled' : '';

        return `
            <tr class="${rowClass}">
                <td>${offset + index + 1}</td>
                <td>${course.course_code}</td>
                <td>${course.course_name}</td>
                <td>${course.professor}</td>
                <td>${course.division || '-'}</td>
                <td>${course.field || '-'}</td>
                <td>${course.area || '-'}</td>
                <td>${course.credits}</td>
                <td>
                    <button class="btn btn-primary btn-sm select-course-btn"
                            data-course-id="${course.id}"
                            ${isSelected ? 'disabled' : ''}>
                        선택
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Add event listeners to select buttons
    document.querySelectorAll('.select-course-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const courseId = parseInt(this.dataset.courseId);
            const course = courses.find(c => c.id === courseId);
            if (course) {
                selectCourse(course);
            }
        });
    });
}

function renderPagination(total, offset, limit) {
    const container = document.getElementById('pagination');
    if (!container) return;

    if (!total || total <= limit) {
        container.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.floor(offset / limit) + 1;
    const prevDisabled = offset <= 0;
    const nextDisabled = offset + limit >= total;

    container.innerHTML = `
        <button id="prevPageBtn" ${prevDisabled ? 'disabled' : ''}>이전</button>
        <button class="active" disabled>${currentPage} / ${totalPages} (총 ${total}개)</button>
        <button id="nextPageBtn" ${nextDisabled ? 'disabled' : ''}>다음</button>
    `;

    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentOffset = Math.max(0, currentOffset - limit);
            searchCourses(false);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentOffset + limit < total) {
                currentOffset += limit;
                searchCourses(false);
            }
        });
    }
}

async function loadMySelections() {
    try {
        const data = await apiRequest('/api/selections');
        mySelections = data.selections || [];
        document.getElementById('totalCredits').textContent = data.total_credits.toFixed(1);
        renderMySelections();
    } catch (error) {
        alert('선택 목록 조회 중 오류가 발생했습니다: ' + error.message);
    }
}

function renderMySelections() {
    const wrapper = document.getElementById('selectionsWrapper');

    if (mySelections.length === 0) {
        wrapper.innerHTML = '<p class="no-selections">선택된 과목이 없습니다</p>';
        return;
    }

    wrapper.innerHTML = mySelections.map(sel => {
        const alternativesHtml = (sel.alternatives || []).map(alt => `
            <div class="selection-alternative alt-${alt.alternative_priority}">
                <div class="alternative-label">대체 강의 ${alt.alternative_priority}순위</div>
                <div class="selection-course">
                    <strong>${alt.course.course_name}</strong> (${alt.course.credits}학점)
                    <div class="selection-professors">
                        ${alt.professor_1st}${alt.professor_2nd ? ', ' + alt.professor_2nd : ''}${alt.professor_3rd ? ', ' + alt.professor_3rd : ''}
                    </div>
                </div>
                <div class="selection-actions">
                    <button class="btn btn-delete btn-sm delete-selection-btn" data-selection-id="${alt.id}">삭제</button>
                </div>
            </div>
        `).join('');

        const canAddAlt = !sel.alternatives || sel.alternatives.length < 2;

        return `
            <div class="selection-item priority-${sel.priority}" data-selection-id="${sel.id}">
                <div class="selection-header">
                    <div class="selection-title">${sel.priority}지망</div>
                    <div class="selection-priority">${sel.course.credits}학점</div>
                </div>
                <div class="selection-course">
                    <strong>${sel.course.course_name}</strong> (${sel.course.course_code})
                    <div class="selection-professors">
                        교수: ${sel.professor_1st}${sel.professor_2nd ? ', ' + sel.professor_2nd : ''}${sel.professor_3rd ? ', ' + sel.professor_3rd : ''}
                    </div>
                </div>
                ${alternativesHtml}
                <div class="selection-actions">
                    ${canAddAlt ? `<button class="btn btn-add-alt btn-sm add-alt-btn" data-selection-id="${sel.id}">대체 강의 추가</button>` : ''}
                    <button class="btn btn-delete btn-sm delete-selection-btn" data-selection-id="${sel.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.delete-selection-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteSelection(parseInt(this.dataset.selectionId));
        });
    });

    document.querySelectorAll('.add-alt-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const selId = parseInt(this.dataset.selectionId);
            const sel = mySelections.find(s => s.id === selId);
            if (sel) {
                openAlternativeModal(selId, sel.course);
            }
        });
    });
}

function selectCourse(course) {
    selectedCourseForModal = course;

    // Display course info
    document.getElementById('modalCourseInfo').innerHTML = `
        <strong>${course.course_name}</strong>
        <p>과목번호: ${course.course_code} | 학점: ${course.credits} | 담당교수: ${course.professor}</p>
    `;

    // Set professor 1st automatically
    document.getElementById('modalProf1').value = course.professor;
    document.getElementById('modalProf2').value = '';
    document.getElementById('modalProf3').value = '';

    // Reset priority
    document.getElementById('modalPriority').value = '';

    // Show current selections
    displayCurrentSelectionsPreview();

    openModal('selectionModal');
}

function displayCurrentSelectionsPreview() {
    const preview = document.getElementById('currentSelectionsPreview');
    if (mySelections.length === 0) {
        preview.innerHTML = '';
        return;
    }

    const usedPriorities = mySelections.map(s => s.priority);

    preview.innerHTML = `
        <h4>현재 선택 현황</h4>
        <div style="font-size: 12px; color: #666;">
            ${[1,2,3,4,5,6,7,8,9,10].map(p => {
                const sel = mySelections.find(s => s.priority === p);
                if (sel) {
                    return `${p}지망: ${sel.course.course_name}`;
                } else {
                    return `${p}지망: <span style="color: #28a745;">선택 가능</span>`;
                }
            }).join(' | ')}
        </div>
    `;
}

async function confirmSelection() {
    const priority = parseInt(document.getElementById('modalPriority').value);
    const prof1 = document.getElementById('modalProf1').value.trim();
    const prof2 = document.getElementById('modalProf2').value.trim();
    const prof3 = document.getElementById('modalProf3').value.trim();

    if (!priority) {
        alert('우선순위를 선택해주세요.');
        return;
    }

    if (!prof1) {
        alert('교수님 1지망을 입력해주세요.');
        return;
    }

    try {
        await apiRequest('/api/selections', {
            method: 'POST',
            body: JSON.stringify({
                course_id: selectedCourseForModal.id,
                priority: priority,
                professor_1st: prof1,
                professor_2nd: prof2,
                professor_3rd: prof3,
            }),
        });

        closeModal('selectionModal');
        await loadMySelections();
        await searchCourses(); // Refresh to update disabled states
    } catch (error) {
        alert('과목 선택 중 오류가 발생했습니다: ' + error.message);
    }
}

function openAlternativeModal(parentSelectionId, parentCourse) {
    selectedParentSelectionForAlt = parentSelectionId;

    // Display parent course info
    document.getElementById('altModalCourseInfo').innerHTML = `
        <strong>원 강의: ${parentCourse.course_name}</strong>
        <p>과목번호: ${parentCourse.course_code} | 학점: ${parentCourse.credits}</p>
    `;

    // Reset fields
    document.getElementById('altModalPriority').value = '';
    document.getElementById('altModalProf1').value = '';
    document.getElementById('altModalProf2').value = '';
    document.getElementById('altModalProf3').value = '';

    // Load recommended alternatives
    loadRecommendedAlternatives(parentCourse.id);

    openModal('alternativeModal');
}

async function loadRecommendedAlternatives(courseId) {
    const container = document.getElementById('recommendedCourses');

    try {
        const data = await apiRequest(`/api/recommendations?course_id=${courseId}&limit=5`);
        const courses = data.courses || [];

        if (courses.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Get selected course IDs
        const selectedCourseIds = new Set(
            mySelections.flatMap(sel => {
                const ids = [sel.course_id];
                if (sel.alternatives) {
                    ids.push(...sel.alternatives.map(alt => alt.course_id));
                }
                return ids;
            })
        );

        const filteredCourses = courses.filter(c => !selectedCourseIds.has(c.id));

        container.innerHTML = `
            <h4>추천 대체 강의 (같은 분야)</h4>
            ${filteredCourses.map((c, idx) => `
                <div class="recommended-item" data-course-idx="${idx}">
                    <strong>${c.course_name}</strong>
                    <div style="font-size: 12px; color: #666;">
                        ${c.course_code} | ${c.professor} | ${c.credits}학점 | ${c.division}
                    </div>
                </div>
            `).join('')}
        `;

        // Add event listeners
        document.querySelectorAll('.recommended-item').forEach((item, idx) => {
            item.addEventListener('click', function() {
                selectRecommendedAlt(filteredCourses[idx], this);
            });
        });
    } catch (error) {
        container.innerHTML = '';
    }
}

function selectRecommendedAlt(course, clickedEl) {
    document.querySelectorAll('#recommendedCourses .recommended-item').forEach(el => {
        el.classList.remove('selected');
    });
    clickedEl.classList.add('selected');

    document.getElementById('altModalProf1').value = course.professor;
    selectedAltCourse = course;
}

async function confirmAlternative() {
    const priority = parseInt(document.getElementById('altModalPriority').value);
    const prof1 = document.getElementById('altModalProf1').value.trim();
    const prof2 = document.getElementById('altModalProf2').value.trim();
    const prof3 = document.getElementById('altModalProf3').value.trim();

    if (!selectedAltCourse) {
        alert('대체 강의를 선택해주세요.');
        return;
    }

    if (!priority) {
        alert('대체 강의 우선순위를 선택해주세요.');
        return;
    }

    if (!prof1) {
        alert('교수님 1지망을 입력해주세요.');
        return;
    }

    try {
        await apiRequest(`/api/selections/${selectedParentSelectionForAlt}/alternatives`, {
            method: 'POST',
            body: JSON.stringify({
                course_id: selectedAltCourse.id,
                alternative_priority: priority,
                professor_1st: prof1,
                professor_2nd: prof2,
                professor_3rd: prof3,
            }),
        });

        closeModal('alternativeModal');
        await loadMySelections();
        await searchCourses();
        selectedAltCourse = null;
    } catch (error) {
        alert('대체 강의 추가 중 오류가 발생했습니다: ' + error.message);
    }
}

async function deleteSelection(selectionId) {
    if (!confirm('이 선택을 삭제하시겠습니까?')) {
        return;
    }

    try {
        await apiRequest(`/api/selections/${selectionId}`, {
            method: 'DELETE',
        });

        await loadMySelections();
        await searchCourses();
    } catch (error) {
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    }
}

async function submitSurvey() {
    const totalCredits = parseFloat(document.getElementById('totalCredits').textContent);

    if (totalCredits < 10) {
        alert('최소 10학점 이상 선택해야 합니다.');
        return;
    }

    if (totalCredits > 21) {
        alert('최대 21학점까지만 선택할 수 있습니다.');
        return;
    }

    if (!confirm(`총 ${totalCredits}학점을 선택하셨습니다.\n설문조사를 제출하시겠습니까?`)) {
        return;
    }

    try {
        await apiRequest('/api/submit', {
            method: 'POST',
        });

        alert('설문조사가 제출되었습니다.');
        window.location.href = '/result.html';
    } catch (error) {
        alert('제출 중 오류가 발생했습니다: ' + error.message);
    }
}

function setupModalListeners() {
    // Selection modal
    document.getElementById('modalConfirm').addEventListener('click', confirmSelection);
    document.getElementById('modalCancel').addEventListener('click', () => {
        closeModal('selectionModal');
    });

    // Alternative modal
    document.getElementById('altModalConfirm').addEventListener('click', confirmAlternative);
    document.getElementById('altModalCancel').addEventListener('click', () => {
        closeModal('alternativeModal');
        selectedAltCourse = null;
    });
    document.getElementById('altModalSkip').addEventListener('click', () => {
        closeModal('alternativeModal');
        selectedAltCourse = null;
    });
}
