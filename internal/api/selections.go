package api

import (
	"course-survey/internal/db"
	"course-survey/internal/middleware"
	"course-survey/internal/models"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type SelectionHandler struct {
	DB *db.Database
}

func NewSelectionHandler(database *db.Database) *SelectionHandler {
	return &SelectionHandler{DB: database}
}

// GetSelections returns all selections for the logged-in student
func (h *SelectionHandler) GetSelections(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	selections, err := h.DB.GetSelectionsByStudent(studentID)
	if err != nil {
		http.Error(w, "Failed to get selections", http.StatusInternalServerError)
		return
	}

	totalCredits, err := h.DB.GetTotalCredits(studentID)
	if err != nil {
		http.Error(w, "Failed to calculate credits", http.StatusInternalServerError)
		return
	}

	response := models.SelectionListResponse{
		TotalCredits: totalCredits,
		Selections:   selections,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateSelection creates a new course selection
func (h *SelectionHandler) CreateSelection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.CreateSelectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate priority (1-7)
	if req.Priority < 1 || req.Priority > 10 {
		http.Error(w, "Priority must be between 1 and 10", http.StatusBadRequest)
		return
	}

	// Check if course is already selected
	isSelected, err := h.DB.IsCourseSelected(studentID, req.CourseID)
	if err != nil {
		http.Error(w, "Failed to check course selection", http.StatusInternalServerError)
		return
	}
	if isSelected {
		http.Error(w, "Course already selected", http.StatusBadRequest)
		return
	}

	// Check if priority is already taken
	isTaken, err := h.DB.IsPriorityTaken(studentID, req.Priority)
	if err != nil {
		http.Error(w, "Failed to check priority", http.StatusInternalServerError)
		return
	}
	if isTaken {
		http.Error(w, "Priority already taken", http.StatusBadRequest)
		return
	}

	// Check total credits (max 21)
	totalCredits, err := h.DB.GetTotalCredits(studentID)
	if err != nil {
		http.Error(w, "Failed to calculate credits", http.StatusInternalServerError)
		return
	}

	course, err := h.DB.GetCourseByID(req.CourseID)
	if err != nil || course == nil {
		http.Error(w, "Course not found", http.StatusNotFound)
		return
	}

	if totalCredits+course.Credits > 21 {
		http.Error(w, "Total credits would exceed 21", http.StatusBadRequest)
		return
	}

	// Create selection
	selection := &models.CourseSelection{
		StudentID:    studentID,
		CourseID:     req.CourseID,
		Priority:     req.Priority,
		Professor1st: req.Professor1st,
		Professor2nd: req.Professor2nd,
		Professor3rd: req.Professor3rd,
		IsAlternative: false,
	}

	if err := h.DB.CreateSelection(selection); err != nil {
		http.Error(w, "Failed to create selection", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success":       true,
		"selection_id":  selection.ID,
		"total_credits": totalCredits + course.Credits,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateAlternative creates an alternative course for a selection
func (h *SelectionHandler) CreateAlternative(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract parent selection ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	parentIDStr := pathParts[len(pathParts)-2]
	parentID, err := strconv.Atoi(parentIDStr)
	if err != nil {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	var req models.CreateAlternativeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate alternative priority (1-2)
	if req.AlternativePriority < 1 || req.AlternativePriority > 2 {
		http.Error(w, "Alternative priority must be 1 or 2", http.StatusBadRequest)
		return
	}

	// Check if course is already selected
	isSelected, err := h.DB.IsCourseSelected(studentID, req.CourseID)
	if err != nil {
		http.Error(w, "Failed to check course selection", http.StatusInternalServerError)
		return
	}
	if isSelected {
		http.Error(w, "Course already selected", http.StatusBadRequest)
		return
	}

	// Get parent selection's priority
	query := `SELECT priority FROM course_selections WHERE id = ? AND student_id = ?`
	var parentPriority int
	err = h.DB.DB.QueryRow(query, parentID, studentID).Scan(&parentPriority)
	if err != nil {
		http.Error(w, "Parent selection not found", http.StatusNotFound)
		return
	}

	// Create alternative selection
	selection := &models.CourseSelection{
		StudentID:           studentID,
		CourseID:            req.CourseID,
		Priority:            parentPriority,
		Professor1st:        req.Professor1st,
		Professor2nd:        req.Professor2nd,
		Professor3rd:        req.Professor3rd,
		IsAlternative:       true,
		ParentSelectionID:   &parentID,
		AlternativePriority: &req.AlternativePriority,
	}

	if err := h.DB.CreateSelection(selection); err != nil {
		http.Error(w, "Failed to create alternative", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success":        true,
		"alternative_id": selection.ID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateSelection updates a course selection
func (h *SelectionHandler) UpdateSelection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract selection ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	selectionIDStr := pathParts[len(pathParts)-1]
	selectionID, err := strconv.Atoi(selectionIDStr)
	if err != nil {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	// Verify ownership
	query := `SELECT student_id FROM course_selections WHERE id = ?`
	var ownerID int
	err = h.DB.DB.QueryRow(query, selectionID).Scan(&ownerID)
	if err != nil {
		http.Error(w, "Selection not found", http.StatusNotFound)
		return
	}
	if ownerID != studentID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req models.UpdateSelectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update selection
	if err := h.DB.UpdateSelection(selectionID, req.Professor1st, req.Professor2nd, req.Professor3rd); err != nil {
		http.Error(w, "Failed to update selection", http.StatusInternalServerError)
		return
	}

	response := map[string]bool{"success": true}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteSelection deletes a course selection
func (h *SelectionHandler) DeleteSelection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract selection ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	selectionIDStr := pathParts[len(pathParts)-1]
	selectionID, err := strconv.Atoi(selectionIDStr)
	if err != nil {
		http.Error(w, "Invalid selection ID", http.StatusBadRequest)
		return
	}

	// Verify ownership
	query := `SELECT student_id FROM course_selections WHERE id = ?`
	var ownerID int
	err = h.DB.DB.QueryRow(query, selectionID).Scan(&ownerID)
	if err != nil {
		http.Error(w, "Selection not found", http.StatusNotFound)
		return
	}
	if ownerID != studentID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Delete selection (CASCADE will delete alternatives)
	if err := h.DB.DeleteSelection(selectionID); err != nil {
		http.Error(w, "Failed to delete selection", http.StatusInternalServerError)
		return
	}

	// Get new total credits
	totalCredits, err := h.DB.GetTotalCredits(studentID)
	if err != nil {
		http.Error(w, "Failed to calculate credits", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success":       true,
		"total_credits": totalCredits,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Submit submits the survey
func (h *SelectionHandler) Submit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Check total credits (10-21)
	totalCredits, err := h.DB.GetTotalCredits(studentID)
	if err != nil {
		http.Error(w, "Failed to calculate credits", http.StatusInternalServerError)
		return
	}

	if totalCredits < 10 {
		http.Error(w, "Total credits must be at least 10", http.StatusBadRequest)
		return
	}

	if totalCredits > 21 {
		http.Error(w, "Total credits must not exceed 21", http.StatusBadRequest)
		return
	}

	// Update submission status
	if err := h.DB.UpdateStudentSubmitStatus(studentID, true); err != nil {
		http.Error(w, "Failed to submit survey", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success":       true,
		"message":       "설문조사가 제출되었습니다.",
		"total_credits": totalCredits,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Reopen reopens the survey for editing
func (h *SelectionHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Update submission status
	if err := h.DB.UpdateStudentSubmitStatus(studentID, false); err != nil {
		http.Error(w, "Failed to reopen survey", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "설문조사를 다시 수정할 수 있습니다.",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
