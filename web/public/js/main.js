// Main page functionality

let currentStudent = null;
let allCourses = [];
let mySelections = [];
let selectedCourseForModal = null;
let selectedParentSelectionForAlt = null;
let selectedParentCourseForAlt = null;
let selectedAltCourse = null;
let pendingConflictData = null;

let altCurrentOffset = 0;
let altCurrentTotal = 0;

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

    renderStudentTooltip();

    await loadCourseFiltersInto('filterDivision', 'filterField');

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

    const selectionsTable = document.getElementById('selectionsTable');
    if (selectionsTable) {
        selectionsTable.addEventListener('click', (e) => {
            const btn = e.target.closest('.add-alt-btn');
            if (!btn || !selectionsTable.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            const sid = btn.getAttribute('data-selection-id');
            const selId = parseInt(sid, 10);
            if (Number.isNaN(selId)) return;
            const sel = mySelections.find(s => s.id === selId);
            if (!sel) return;
            openAlternativeModal(selId, sel).catch(err => {
                alert('대체 강의 창을 열 수 없습니다: ' + (err && err.message ? err.message : String(err)));
            });
        });
    }

    // Load initial data
    await loadMySelections();

    // Initial search
    await searchCourses(true);
});

function getTakenCourseIds() {
    return new Set(
        mySelections.flatMap(sel => {
            const ids = [sel.course_id];
            if (sel.alternatives) {
                ids.push(...sel.alternatives.map(alt => alt.course_id));
            }
            return ids;
        })
    );
}

function getTakenCourseCodes() {
    return new Set(
        mySelections.flatMap(sel => {
            const codes = [sel.course.course_code];
            if (sel.alternatives) {
                codes.push(...sel.alternatives.map(alt => alt.course.course_code));
            }
            return codes;
        })
    );
}

async function loadCourseFiltersInto(divisionSelectId, fieldSelectId) {
    try {
        const data = await apiRequest('/api/course-filters');
        const divisions = (data.divisions || []).filter(Boolean);
        const fields = (data.fields || []).filter(Boolean);

        const divisionSelect = document.getElementById(divisionSelectId);
        const fieldSelect = document.getElementById(fieldSelectId);

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

    const selectedCourseIds = getTakenCourseIds();
    const selectedCourseCodes = getTakenCourseCodes();

    tbody.innerHTML = courses.map((course, index) => {
        // Check both course_id and course_code
        const isSelected = selectedCourseIds.has(course.id) || selectedCourseCodes.has(course.course_code);
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

function resetAlternativeModalBrowseState() {
    selectedAltCourse = null;
    const searchIn = document.getElementById('altSearchInput');
    if (searchIn) searchIn.value = '';
    const picked = document.getElementById('altModalSelectedCourseInfo');
    if (picked) picked.hidden = true;
    const p1 = document.getElementById('altModalProf1');
    const p2 = document.getElementById('altModalProf2');
    const p3 = document.getElementById('altModalProf3');
    if (p1) p1.value = '';
    if (p2) p2.value = '';
    if (p3) p3.value = '';
}

async function searchAltCourses(resetPage = false) {
    const divEl = document.getElementById('altFilterDivision');
    const fieldEl = document.getElementById('altFilterField');
    const searchEl = document.getElementById('altSearchInput');
    if (!divEl || !fieldEl || !searchEl) return;

    if (resetPage) {
        altCurrentOffset = 0;
    }

    const division = divEl.value;
    const field = fieldEl.value;
    const search = searchEl.value.trim();

    const params = new URLSearchParams();
    if (division) params.append('division', division);
    if (field) params.append('field', field);
    if (search) params.append('search', search);
    params.append('limit', String(PAGE_SIZE));
    params.append('offset', String(altCurrentOffset));

    try {
        const data = await apiRequest(`/api/courses?${params.toString()}`);
        const courses = data.courses || [];
        altCurrentTotal = typeof data.total === 'number' ? data.total : courses.length;
        renderAltCourseTable(courses, altCurrentOffset);
        renderAltPagination(altCurrentTotal, altCurrentOffset, PAGE_SIZE);
    } catch (error) {
        alert('강좌 조회 중 오류가 발생했습니다: ' + error.message);
    }
}

function renderAltCourseTable(courses, offset = 0) {
    const tbody = document.getElementById('altCourseTableBody');
    if (!tbody) return;
    const parentId = selectedParentCourseForAlt ? selectedParentCourseForAlt.id : -1;
    const selectedCourseIds = getTakenCourseIds();
    const selectedCourseCodes = getTakenCourseCodes();

    if (courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">조회 결과가 없습니다</td></tr>';
        return;
    }

    tbody.innerHTML = courses.map((course, index) => {
        const isTaken = selectedCourseIds.has(course.id) || selectedCourseCodes.has(course.course_code);
        const isParent = course.id === parentId;
        const unavailable = isTaken || isParent;
        const rowClass = unavailable ? 'course-disabled' : '';

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
                    <button type="button" class="btn btn-primary btn-sm select-alt-course-btn"
                            data-course-id="${course.id}"
                            ${unavailable ? 'disabled' : ''}>
                        선택
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.select-alt-course-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.disabled) return;
            const courseId = parseInt(this.dataset.courseId, 10);
            const course = courses.find(c => c.id === courseId);
            if (course) {
                pickAltCourseForAlternative(course);
            }
        });
    });
}

function renderAltPagination(total, offset, limit) {
    const container = document.getElementById('altPagination');
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
        <button type="button" id="altPrevPageBtn" ${prevDisabled ? 'disabled' : ''}>이전</button>
        <button type="button" class="active" disabled>${currentPage} / ${totalPages} (총 ${total}개)</button>
        <button type="button" id="altNextPageBtn" ${nextDisabled ? 'disabled' : ''}>다음</button>
    `;

    const prevBtn = document.getElementById('altPrevPageBtn');
    const nextBtn = document.getElementById('altNextPageBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            altCurrentOffset = Math.max(0, altCurrentOffset - limit);
            searchAltCourses(false);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (altCurrentOffset + limit < total) {
                altCurrentOffset += limit;
                searchAltCourses(false);
            }
        });
    }
}

async function pickAltCourseForAlternative(course) {
    selectedAltCourse = course;
    const p1 = document.getElementById('altModalProf1');
    if (p1) p1.value = course.professor || '';

    // Load professors for 2nd and 3rd choices
    await loadProfessorsForCourse(course.id, course.professor, 'altModalProf2', 'altModalProf3');

    const picked = document.getElementById('altModalSelectedCourseInfo');
    const detail = document.getElementById('altModalSelectedCourseDetail');
    if (picked && detail) {
        detail.textContent = `${course.course_name} · ${course.course_code} · ${course.credits}학점 · ${course.professor}`;
        picked.hidden = false;
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
    // Clear all cells
    document.querySelectorAll('.selection-cell').forEach(cell => {
        cell.innerHTML = '';
        cell.classList.remove('has-selection');
        cell.removeAttribute('draggable');
        cell.removeAttribute('data-selection-id');
        delete cell.dataset.isAlternative;
        delete cell.dataset.parentSelectionId;
    });

    if (mySelections.length === 0) {
        return;
    }

    const mainSelections = mySelections.filter(s => !s.is_alternative);
    const standaloneAlts = mySelections.filter(s => s.is_alternative && !s.parent_selection_id);

    // Track which alt cells are occupied by attached alternatives
    const occupiedAltPriorities = new Set();

    // Render main selections and their attached alternatives
    mainSelections.forEach(sel => {
        const mainCell = document.querySelector(`.selection-cell[data-priority="${sel.priority}"][data-type="main"]`);
        if (mainCell) {
            mainCell.classList.add('has-selection');
            mainCell.draggable = true;
            mainCell.dataset.selectionId = sel.id;

            mainCell.innerHTML = `
                <div class="selection-content" data-selection-id="${sel.id}">
                    <div class="selection-course-name">${sel.course.course_name}</div>
                    <div class="selection-credits">${sel.course.credits}학점</div>
                    <div class="selection-professors">${sel.professor_1st}${sel.professor_2nd ? ', ' + sel.professor_2nd : ''}${sel.professor_3rd ? ', ' + sel.professor_3rd : ''}</div>
                    <div class="selection-actions-inline">
                        <button class="btn-icon edit-selection-btn" title="수정" data-selection-id="${sel.id}">✏️</button>
                        <button class="btn-icon delete-selection-btn" title="삭제" data-selection-id="${sel.id}">🗑️</button>
                    </div>
                </div>
            `;
        }

        const altCell = document.querySelector(`.selection-cell[data-priority="${sel.priority}"][data-type="alternative"]`);
        if (altCell) {
            const alternatives = sel.alternatives || [];
            const hasAlternative = alternatives.length > 0;

            if (hasAlternative) {
                const alt = alternatives[0];
                altCell.classList.add('has-selection');
                altCell.draggable = true;
                altCell.dataset.selectionId = alt.id;
                altCell.dataset.isAlternative = 'true';
                altCell.dataset.parentSelectionId = sel.id;
                occupiedAltPriorities.add(sel.priority);

                altCell.innerHTML = `
                    <div class="selection-content alternative">
                        <div class="selection-course-name">${alt.course.course_name}</div>
                        <div class="selection-credits">${alt.course.credits}학점</div>
                        <div class="selection-professors">${alt.professor_1st}${alt.professor_2nd ? ', ' + alt.professor_2nd : ''}${alt.professor_3rd ? ', ' + alt.professor_3rd : ''}</div>
                        <div class="selection-actions-inline">
                            <button class="btn-icon edit-selection-btn" title="수정" data-selection-id="${alt.id}">✏️</button>
                            <button class="btn-icon delete-selection-btn" title="삭제" data-selection-id="${alt.id}">🗑️</button>
                        </div>
                    </div>
                `;
            } else {
                altCell.innerHTML = `
                    <button type="button" class="btn-add-alt-table add-alt-btn" data-selection-id="${sel.id}">+대체 강의</button>
                `;
            }
        }
    });

    // Render standalone alternatives (no parent selection)
    standaloneAlts.forEach(alt => {
        if (occupiedAltPriorities.has(alt.priority)) return;

        const altCell = document.querySelector(`.selection-cell[data-priority="${alt.priority}"][data-type="alternative"]`);
        if (altCell) {
            altCell.classList.add('has-selection');
            altCell.draggable = true;
            altCell.dataset.selectionId = alt.id;
            altCell.dataset.isAlternative = 'true';
            altCell.dataset.parentSelectionId = ''; // empty = standalone

            altCell.innerHTML = `
                <div class="selection-content alternative">
                    <div class="selection-course-name">${alt.course.course_name}</div>
                    <div class="selection-credits">${alt.course.credits}학점</div>
                    <div class="selection-professors">${alt.professor_1st}${alt.professor_2nd ? ', ' + alt.professor_2nd : ''}${alt.professor_3rd ? ', ' + alt.professor_3rd : ''}</div>
                    <div class="selection-actions-inline">
                        <button class="btn-icon edit-selection-btn" title="수정" data-selection-id="${alt.id}">✏️</button>
                        <button class="btn-icon delete-selection-btn" title="삭제" data-selection-id="${alt.id}">🗑️</button>
                    </div>
                </div>
            `;
        }
    });

    // Setup event listeners
    setupSelectionEventListeners();
    setupDragAndDrop();
}

function setupSelectionEventListeners() {
    document.querySelectorAll('.delete-selection-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteSelection(parseInt(this.dataset.selectionId));
        });
    });

    document.querySelectorAll('.edit-selection-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openEditModal(parseInt(this.dataset.selectionId));
        });
    });

}

function setupDragAndDrop() {
    const draggableCells = document.querySelectorAll('.selection-cell[draggable="true"]');

    draggableCells.forEach(cell => {
        cell.addEventListener('dragstart', handleDragStart);
        cell.addEventListener('dragend', handleDragEnd);
    });

    // Allow dropping on both main and alternative cells
    const allDroppableCells = document.querySelectorAll('.selection-cell[data-type="main"], .selection-cell[data-type="alternative"]');
    allDroppableCells.forEach(cell => {
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('drop', handleDrop);
        cell.addEventListener('dragleave', handleDragLeave);
    });
}

let draggedElement = null;
let draggedSelectionId = null;
let draggedIsAlternative = false;
let draggedParentSelectionId = null;

function handleDragStart(e) {
    draggedElement = this;
    draggedSelectionId = parseInt(this.dataset.selectionId);
    draggedIsAlternative = this.dataset.isAlternative === 'true';
    draggedParentSelectionId = this.dataset.parentSelectionId ? parseInt(this.dataset.parentSelectionId) : null;

    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.selection-cell').forEach(cell => {
        cell.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }

    return false;
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');
    if (this === draggedElement) return false;

    const targetPriority = parseInt(this.dataset.priority);
    const targetCellType = this.dataset.type; // 'main' | 'alternative'

    // Resolve dragged item from current mySelections snapshot
    const source = resolveItem(draggedSelectionId, draggedIsAlternative);
    if (!source) return false;

    // Same cell: do nothing
    const sourceCellType = source.isAlternative ? 'alternative' : 'main';
    if (source.priority === targetPriority && sourceCellType === targetCellType) return false;

    // Resolve target item (null = empty cell)
    const target = getItemAtCell(targetPriority, targetCellType);

    // Build confirm message
    const srcLabel = source.isAlternative ? '대체강의' : '선택강의';
    const tgtCellLabel = targetCellType === 'main' ? '선택강의' : '대체강의';
    let confirmMsg;
    if (target) {
        const tgtLabel = target.isAlternative ? '대체강의' : '선택강의';
        confirmMsg = `"${source.course.course_name}"(${srcLabel})와(과) "${target.course.course_name}"(${tgtLabel})를 교환하시겠습니까?`;
        const warnings = [];
        if (!source.isAlternative && source.hasAlts) warnings.push(`"${source.course.course_name}"의 대체강의 삭제`);
        if (!target.isAlternative && target.hasAlts) warnings.push(`"${target.course.course_name}"의 대체강의 삭제`);
        if (warnings.length) confirmMsg += '\n(주의: ' + warnings.join(', ') + ')';
    } else {
        confirmMsg = `"${source.course.course_name}"을(를) ${targetPriority}지망 ${tgtCellLabel}로 이동하시겠습니까?`;
        if (!source.isAlternative && source.hasAlts) confirmMsg += '\n(주의: 연결된 대체강의 삭제)';
    }
    if (!confirm(confirmMsg)) return false;

    // Main→Main: use priority API to preserve attached alternatives
    if (!source.isAlternative && targetCellType === 'main') {
        try {
            if (target) {
                await swapMainPriorities(source.id, target.id, source.priority, targetPriority);
            } else {
                await apiRequest(`/api/selections/${source.id}/priority`, {
                    method: 'PUT',
                    body: JSON.stringify({ priority: targetPriority }),
                });
                await loadMySelections();
                await searchCourses();
            }
        } catch (err) {
            alert('이동 중 오류가 발생했습니다: ' + err.message);
            await loadMySelections();
            await searchCourses();
        }
        return false;
    }

    // All other combinations: delete + create
    await executeSwapOrMove(source, target, targetCellType, targetPriority);
    return false;
}

// Resolve a dragged item's full data from the current mySelections snapshot
function resolveItem(selectionId, isAlt) {
    if (!isAlt) {
        const sel = mySelections.find(s => s.id === selectionId && !s.is_alternative);
        if (!sel) return null;
        return {
            id: sel.id, courseId: sel.course_id, course: sel.course,
            prof1: sel.professor_1st, prof2: sel.professor_2nd, prof3: sel.professor_3rd,
            isAlternative: false, parentSelectionId: null, priority: sel.priority,
            hasAlts: !!(sel.alternatives && sel.alternatives.length),
        };
    }
    // Attached alternatives (nested inside main selections)
    for (const sel of mySelections) {
        if (!sel.is_alternative && sel.alternatives) {
            const a = sel.alternatives.find(a => a.id === selectionId);
            if (a) {
                return {
                    id: a.id, courseId: a.course_id, course: a.course,
                    prof1: a.professor_1st, prof2: a.professor_2nd, prof3: a.professor_3rd,
                    isAlternative: true, parentSelectionId: sel.id, priority: sel.priority,
                    hasAlts: false,
                };
            }
        }
    }
    // Standalone alternatives (top-level with is_alternative=true)
    const standalone = mySelections.find(s => s.is_alternative && s.id === selectionId);
    if (standalone) {
        return {
            id: standalone.id, courseId: standalone.course_id, course: standalone.course,
            prof1: standalone.professor_1st, prof2: standalone.professor_2nd, prof3: standalone.professor_3rd,
            isAlternative: true, parentSelectionId: null, priority: standalone.priority,
            hasAlts: false,
        };
    }
    return null;
}

// Get the item currently occupying a cell (null = empty)
function getItemAtCell(priority, cellType) {
    if (cellType === 'main') {
        const sel = mySelections.find(s => s.priority === priority && !s.is_alternative);
        if (!sel) return null;
        return {
            id: sel.id, courseId: sel.course_id, course: sel.course,
            prof1: sel.professor_1st, prof2: sel.professor_2nd, prof3: sel.professor_3rd,
            isAlternative: false, parentSelectionId: null, priority: priority,
            hasAlts: !!(sel.alternatives && sel.alternatives.length),
        };
    }
    // Alt cell: check attached first, then standalone
    const parentSel = mySelections.find(s => s.priority === priority && !s.is_alternative);
    if (parentSel && parentSel.alternatives && parentSel.alternatives.length > 0) {
        const a = parentSel.alternatives[0];
        return {
            id: a.id, courseId: a.course_id, course: a.course,
            prof1: a.professor_1st, prof2: a.professor_2nd, prof3: a.professor_3rd,
            isAlternative: true, parentSelectionId: parentSel.id, priority: priority,
            hasAlts: false,
        };
    }
    const standalone = mySelections.find(s => s.is_alternative && s.priority === priority);
    if (standalone) {
        return {
            id: standalone.id, courseId: standalone.course_id, course: standalone.course,
            prof1: standalone.professor_1st, prof2: standalone.professor_2nd, prof3: standalone.professor_3rd,
            isAlternative: true, parentSelectionId: null, priority: priority,
            hasAlts: false,
        };
    }
    return null;
}

// Execute move (target=null) or swap (target!=null) for non-main→main operations
async function executeSwapOrMove(source, target, targetCellType, targetPriority) {
    // Track deleted IDs so createAtCell avoids stale mySelections references
    const deletedIds = new Set();
    try {
        // Delete source
        await apiRequest(`/api/selections/${source.id}`, { method: 'DELETE' });
        deletedIds.add(source.id);

        // Delete target; it may already be cascade-deleted (e.g. main's own attached alt)
        if (target) {
            try {
                await apiRequest(`/api/selections/${target.id}`, { method: 'DELETE' });
            } catch (e) {
                if (!/not found/i.test(e.message)) throw e;
            }
            deletedIds.add(target.id);
        }

        // Place source at target cell
        await createAtCell(source, targetCellType, targetPriority, deletedIds);

        // Place target at source cell (swap only)
        if (target) {
            await createAtCell(target, sourceCellType(source), source.priority, deletedIds);
        }

        await loadMySelections();
        await searchCourses();
    } catch (err) {
        alert('이동 중 오류가 발생했습니다: ' + err.message);
        await loadMySelections();
        await searchCourses();
    }
}

function sourceCellType(source) {
    return source.isAlternative ? 'alternative' : 'main';
}

// Create an item at the given cell position, respecting which parent mains still exist
async function createAtCell(item, cellType, priority, deletedIds = new Set()) {
    if (cellType === 'main') {
        await apiRequest('/api/selections', {
            method: 'POST',
            body: JSON.stringify({
                course_id: item.courseId,
                priority: priority,
                professor_1st: item.prof1,
                professor_2nd: item.prof2 || '',
                professor_3rd: item.prof3 || '',
            }),
        });
        return;
    }
    // Alt cell: attach to existing parent main at this priority, else standalone
    const parentSel = mySelections.find(s => s.priority === priority && !s.is_alternative && !deletedIds.has(s.id));
    if (parentSel) {
        await apiRequest(`/api/selections/${parentSel.id}/alternatives`, {
            method: 'POST',
            body: JSON.stringify({
                course_id: item.courseId,
                alternative_priority: 1,
                professor_1st: item.prof1,
                professor_2nd: item.prof2 || '',
                professor_3rd: item.prof3 || '',
            }),
        });
    } else {
        await apiRequest('/api/selections/standalone-alternative', {
            method: 'POST',
            body: JSON.stringify({
                course_id: item.courseId,
                priority: priority,
                professor_1st: item.prof1,
                professor_2nd: item.prof2 || '',
                professor_3rd: item.prof3 || '',
            }),
        });
    }
}

// Swap two main selections using temporary priority slot (preserves their attached alternatives)
async function swapMainPriorities(selId1, selId2, priority1, priority2) {
    const usedPriorities = new Set(mySelections.filter(s => !s.is_alternative).map(s => s.priority));
    let tempPriority = null;
    for (let i = 1; i <= 10; i++) {
        if (!usedPriorities.has(i) && i !== priority1 && i !== priority2) {
            tempPriority = i;
            break;
        }
    }
    const put = (id, p) => apiRequest(`/api/selections/${id}/priority`, {
        method: 'PUT',
        body: JSON.stringify({ priority: p }),
    });
    if (tempPriority !== null) {
        await put(selId1, tempPriority);
        await put(selId2, priority1);
        await put(selId1, priority2);
    } else {
        await put(selId1, priority2);
        await put(selId2, priority1);
    }
    await loadMySelections();
    await searchCourses();
}

function openEditModal(selectionId) {
    const selection = mySelections.find(s => s.id === selectionId);
    if (!selection) {
        const allAlternatives = mySelections.flatMap(s => s.alternatives || []);
        const altSelection = allAlternatives.find(a => a.id === selectionId);
        if (altSelection) {
            openEditModalForSelection(altSelection);
        }
        return;
    }
    openEditModalForSelection(selection);
}

async function openEditModalForSelection(selection) {
    selectedCourseForModal = selection.course;

    document.getElementById('modalCourseInfo').innerHTML = `
        <strong>${selection.course.course_name}</strong>
        <p>과목번호: ${selection.course.course_code} | 학점: ${selection.course.credits} | 담당교수: ${selection.course.professor}</p>
    `;

    document.getElementById('modalProf1').value = selection.professor_1st || selection.course.professor;
    document.getElementById('modalPriority').value = selection.priority;
    document.getElementById('modalPriority').disabled = true;

    // Load professors for 2nd and 3rd choices
    await loadProfessorsForCourse(
        selection.course.id,
        selection.professor_1st || selection.course.professor,
        'modalProf2',
        'modalProf3',
        selection.professor_2nd || '',
        selection.professor_3rd || ''
    );

    displayCurrentSelectionsPreview();

    // Store the selection ID for updating
    document.getElementById('modalConfirm').dataset.editingId = selection.id;

    openModal('selectionModal');
}

function findLowestAvailablePriority() {
    const usedPriorities = new Set(mySelections.filter(s => !s.is_alternative).map(s => s.priority));
    for (let i = 1; i <= 10; i++) {
        if (!usedPriorities.has(i)) {
            return i;
        }
    }
    return null; // All priorities are taken
}

async function selectCourse(course) {
    selectedCourseForModal = course;

    // Display course info
    document.getElementById('modalCourseInfo').innerHTML = `
        <strong>${course.course_name}</strong>
        <p>과목번호: ${course.course_code} | 학점: ${course.credits} | 담당교수: ${course.professor}</p>
    `;

    // Set professor 1st automatically
    document.getElementById('modalProf1').value = course.professor;

    // Load professors for 2nd and 3rd choices
    await loadProfessorsForCourse(course.id, course.professor, 'modalProf2', 'modalProf3');

    // Auto-assign lowest available priority
    const lowestPriority = findLowestAvailablePriority();
    const prioritySelect = document.getElementById('modalPriority');
    if (lowestPriority !== null) {
        prioritySelect.value = lowestPriority;
    } else {
        prioritySelect.value = '';
    }

    // Show current selections
    displayCurrentSelectionsPreview();

    openModal('selectionModal');
}

async function loadProfessorsForCourse(courseId, selectedProf, select2Id, select3Id, currentProf2 = '', currentProf3 = '') {
    try {
        const response = await apiRequest(`/api/courses/${courseId}/professors`, {
            method: 'GET',
        });

        const professors = response.professors || [];

        // Filter out the selected 1st professor
        const availableProfessors = professors.filter(p => p !== selectedProf);

        // Get dropdown elements
        const select2 = document.getElementById(select2Id);
        const select3 = document.getElementById(select3Id);

        // Populate 2nd professor dropdown
        select2.innerHTML = '<option value="">선택하세요</option>';
        availableProfessors.forEach(prof => {
            const option = document.createElement('option');
            option.value = prof;
            option.textContent = prof;
            if (prof === currentProf2) {
                option.selected = true;
            }
            select2.appendChild(option);
        });

        // Enable/disable based on available professors
        if (availableProfessors.length === 0) {
            // No other professors
            select2.disabled = true;
            select2.innerHTML = '<option value="">선택 불가</option>';
            select3.disabled = true;
            select3.innerHTML = '<option value="">선택 불가</option>';
        } else if (availableProfessors.length === 1) {
            // Only 1 other professor - enable 2nd choice only
            select2.disabled = false;
            select3.disabled = true;
            select3.innerHTML = '<option value="">선택 불가</option>';
        } else {
            // 2+ other professors - enable both
            select2.disabled = false;
            select3.disabled = false;
        }

        // Function to update 3rd choice dropdown based on 2nd choice
        const updateThirdChoice = () => {
            const selected2nd = select2.value;
            select3.innerHTML = '<option value="">선택하세요</option>';

            if (availableProfessors.length < 2) {
                select3.innerHTML = '<option value="">선택 불가</option>';
                select3.disabled = true;
                return;
            }

            // Filter out 2nd choice professor
            const available3rd = availableProfessors.filter(p => p !== selected2nd);

            available3rd.forEach(prof => {
                const option = document.createElement('option');
                option.value = prof;
                option.textContent = prof;
                if (prof === currentProf3 && prof !== selected2nd) {
                    option.selected = true;
                }
                select3.appendChild(option);
            });

            select3.disabled = false;
        };

        // Initial population of 3rd choice
        updateThirdChoice();

        // Remove previous event listener if exists
        if (select2._updateHandler) {
            select2.removeEventListener('change', select2._updateHandler);
        }

        // Add event listener to update 3rd choice when 2nd choice changes
        select2._updateHandler = updateThirdChoice;
        select2.addEventListener('change', updateThirdChoice);

    } catch (error) {
        console.error('Failed to load professors:', error);
        const select2 = document.getElementById(select2Id);
        const select3 = document.getElementById(select3Id);
        select2.innerHTML = '<option value="">선택하세요</option>';
        select3.innerHTML = '<option value="">선택하세요</option>';
        select2.disabled = true;
        select3.disabled = true;
    }
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
                const sel = mySelections.find(s => s.priority === p && !s.is_alternative);
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
    const editingId = document.getElementById('modalConfirm').dataset.editingId;

    if (!priority) {
        alert('우선순위를 선택해주세요.');
        return;
    }

    if (!prof1) {
        alert('교수님 1지망을 입력해주세요.');
        return;
    }

    // Priority conflict check (new selections only)
    if (!editingId) {
        const existing = mySelections.find(s => s.priority === priority && !s.is_alternative);
        if (existing) {
            document.getElementById('priorityConflictMessage').textContent =
                `${priority}지망에 이미 "${existing.course.course_name}"이(가) 선택되어 있습니다. 어떻게 하시겠습니까?`;
            pendingConflictData = {
                existingSelection: existing,
                newCourseId: selectedCourseForModal.id,
                priority, prof1, prof2, prof3,
            };
            openModal('priorityConflictModal');
            return;
        }
    }

    try {
        if (editingId) {
            await apiRequest(`/api/selections/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify({ professor_1st: prof1, professor_2nd: prof2, professor_3rd: prof3 }),
            });
            delete document.getElementById('modalConfirm').dataset.editingId;
            document.getElementById('modalPriority').disabled = false;
        } else {
            await apiRequest('/api/selections', {
                method: 'POST',
                body: JSON.stringify({
                    course_id: selectedCourseForModal.id,
                    priority,
                    professor_1st: prof1,
                    professor_2nd: prof2,
                    professor_3rd: prof3,
                }),
            });
        }
        closeModal('selectionModal');
        await loadMySelections();
        await searchCourses();
    } catch (error) {
        alert('과목 선택 중 오류가 발생했습니다: ' + error.message);
    }
}

async function handleConflictReplace() {
    if (!pendingConflictData) return;
    const { existingSelection, newCourseId, priority, prof1, prof2, prof3 } = pendingConflictData;
    pendingConflictData = null;
    closeModal('priorityConflictModal');
    try {
        await apiRequest(`/api/selections/${existingSelection.id}`, { method: 'DELETE' });
        await apiRequest('/api/selections', {
            method: 'POST',
            body: JSON.stringify({
                course_id: newCourseId,
                priority,
                professor_1st: prof1,
                professor_2nd: prof2,
                professor_3rd: prof3,
            }),
        });
        closeModal('selectionModal');
        await loadMySelections();
        await searchCourses();
    } catch (error) {
        alert('교체 중 오류가 발생했습니다: ' + error.message);
    }
}

async function handleConflictAddAsAlt() {
    if (!pendingConflictData) return;
    const { existingSelection, newCourseId, priority, prof1, prof2, prof3 } = pendingConflictData;
    pendingConflictData = null;
    closeModal('priorityConflictModal');

    if (existingSelection.alternatives && existingSelection.alternatives.length > 0) {
        alert(`${priority}지망에 이미 대체강의가 등록되어 있습니다.`);
        return;
    }
    try {
        await apiRequest(`/api/selections/${existingSelection.id}/alternatives`, {
            method: 'POST',
            body: JSON.stringify({
                course_id: newCourseId,
                alternative_priority: 1,
                professor_1st: prof1,
                professor_2nd: prof2,
                professor_3rd: prof3,
            }),
        });
        closeModal('selectionModal');
        await loadMySelections();
        await searchCourses();
    } catch (error) {
        alert('대체강의 추가 중 오류가 발생했습니다: ' + error.message);
    }
}

function handleConflictCancel() {
    pendingConflictData = null;
    closeModal('priorityConflictModal');
    // Selection modal stays open so user can change priority
}

async function openAlternativeModal(parentSelectionId, sel) {
    const parentCourse = sel && sel.course;
    if (!parentCourse) {
        alert('과목 정보를 불러올 수 없습니다.');
        return;
    }

    selectedParentSelectionForAlt = parentSelectionId;
    selectedParentCourseForAlt = parentCourse;

    const parentEl = document.getElementById('altModalParentInfo');
    if (!parentEl) {
        alert('페이지 구성을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
        return;
    }

    parentEl.innerHTML = `
        <strong>원 강의 (${sel.priority}지망): ${parentCourse.course_name}</strong>
        <p>과목번호: ${parentCourse.course_code} | 학점: ${parentCourse.credits} | 담당교수: ${parentCourse.professor}</p>
    `;

    resetAlternativeModalBrowseState();
    altCurrentOffset = 0;

    // Open modal synchronously with the click gesture (before any await).
    openModal('alternativeModal');

    try {
        await loadCourseFiltersInto('altFilterDivision', 'altFilterField');
        await searchAltCourses(true);
    } catch (error) {
        alert('대체 강의 개설강좌 목록을 불러오지 못했습니다: ' + error.message);
    }
}

async function confirmAlternative() {
    const prof1 = document.getElementById('altModalProf1').value.trim();
    const prof2 = document.getElementById('altModalProf2').value.trim();
    const prof3 = document.getElementById('altModalProf3').value.trim();

    if (!selectedAltCourse) {
        alert('개설강좌 목록에서 대체 강의를 선택해주세요.');
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
                alternative_priority: 1, // Always 1
                professor_1st: prof1,
                professor_2nd: prof2,
                professor_3rd: prof3,
            }),
        });

        closeModal('alternativeModal');
        await loadMySelections();
        await searchCourses();
        selectedAltCourse = null;
        selectedParentCourseForAlt = null;
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

    // Block submission if any standalone alternatives exist (no parent main selection)
    const standaloneAlts = mySelections.filter(s => s.is_alternative && !s.parent_selection_id);
    if (standaloneAlts.length > 0) {
        const names = standaloneAlts.map(s => `${s.priority}지망 대체강의: "${s.course.course_name}"`).join('\n');
        alert(
            '부모 선택강의가 없는 대체강의가 있습니다. 제출 전에 선택강의로 이동해 주세요.\n\n' + names
        );
        return;
    }

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

function renderStudentTooltip() {
    const tooltipEl = document.getElementById('studentInfoTooltip');
    if (!tooltipEl) return;

    const rows = [
        ['목표 전공', currentStudent.major],
        ['부전공/복수전공', currentStudent.minor],
        ['재학 학년', currentStudent.current_year],
        ['특이사항', currentStudent.special_notes],
    ];
    const infoHtml = rows
        .filter(row => row[1])
        .map(row => `<div><strong>${row[0]}:</strong> ${row[1]}</div>`)
        .join('') || '<div style="color:#999">추가 정보 없음</div>';

    tooltipEl.innerHTML = infoHtml +
        '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:6px">' +
        '<button type="button" id="openStudentInfoEditBtn" class="btn btn-primary btn-sm" style="width:100%">추가 정보 수정</button>' +
        '</div>';

    document.getElementById('openStudentInfoEditBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        openStudentInfoEditModal();
    });
}

function openStudentInfoEditModal() {
    const TRACKS = ['물리학트랙', '화학트랙', '생명과학트랙', '뇌과학트랙',
        '기계공학트랙', '재료공학트랙', '전자공학트랙', '컴퓨터공학트랙', '화학공학트랙'];

    const majorSel = document.getElementById('editMajor');
    const minorSel = document.getElementById('editMinor');

    majorSel.value = currentStudent.major || '';
    minorSel.value = currentStudent.minor || '';
    document.getElementById('editCurrentYear').value = currentStudent.current_year || '';
    document.getElementById('editSpecialNotes').value = currentStudent.special_notes || '';

    // Rebuild minor to exclude selected major
    function rebuildEditMinor() {
        const selectedMajor = majorSel.value;
        const currentMinor = minorSel.value;
        minorSel.innerHTML = '<option value="">선택하세요</option>';
        TRACKS.forEach(track => {
            if (track === selectedMajor) return;
            const opt = document.createElement('option');
            opt.value = track;
            opt.textContent = track;
            if (track === currentMinor) opt.selected = true;
            minorSel.appendChild(opt);
        });
    }

    rebuildEditMinor();
    majorSel.removeEventListener('change', majorSel._editHandler);
    majorSel._editHandler = rebuildEditMinor;
    majorSel.addEventListener('change', majorSel._editHandler);

    document.getElementById('editInfoError').style.display = 'none';
    openModal('studentInfoEditModal');
}

async function saveStudentInfo() {
    const major = document.getElementById('editMajor').value;
    const minor = document.getElementById('editMinor').value;
    const currentYear = document.getElementById('editCurrentYear').value;
    const specialNotes = document.getElementById('editSpecialNotes').value.trim();
    const errEl = document.getElementById('editInfoError');

    errEl.style.display = 'none';

    try {
        const updated = await apiRequest('/api/me', {
            method: 'PUT',
            body: JSON.stringify({
                major, minor,
                current_year: currentYear,
                special_notes: specialNotes,
            }),
        });

        currentStudent.major = updated.major;
        currentStudent.minor = updated.minor;
        currentStudent.current_year = updated.current_year;
        currentStudent.special_notes = updated.special_notes;

        // Refresh header and tooltip
        document.getElementById('studentMajor').textContent = updated.major || '-';
        renderStudentTooltip();

        closeModal('studentInfoEditModal');
    } catch (error) {
        errEl.textContent = '저장 중 오류가 발생했습니다: ' + error.message;
        errEl.style.display = 'block';
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
    document.getElementById('altModalSkip').addEventListener('click', () => {
        closeModal('alternativeModal');
        selectedAltCourse = null;
        selectedParentCourseForAlt = null;
    });

    // Student info edit modal
    document.getElementById('studentInfoSaveBtn').addEventListener('click', saveStudentInfo);
    document.getElementById('studentInfoCancelBtn').addEventListener('click', () => closeModal('studentInfoEditModal'));

    // Priority conflict modal
    document.getElementById('conflictReplaceBtn').addEventListener('click', handleConflictReplace);
    document.getElementById('conflictAddAltBtn').addEventListener('click', handleConflictAddAsAlt);
    document.getElementById('conflictCancelBtn').addEventListener('click', handleConflictCancel);

    const altSearchBtn = document.getElementById('altSearchBtn');
    if (altSearchBtn) {
        altSearchBtn.addEventListener('click', () => searchAltCourses(true));
    }
    const altSearchInput = document.getElementById('altSearchInput');
    if (altSearchInput) {
        altSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchAltCourses(true);
            }
        });
    }
}
