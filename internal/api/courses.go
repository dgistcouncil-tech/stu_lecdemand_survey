package api

import (
	"course-survey/internal/db"
	"course-survey/internal/models"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type CourseHandler struct {
	DB *db.Database
}

type CourseFilterOptionsResponse struct {
	Divisions []string `json:"divisions"`
	Fields    []string `json:"fields"`
}

func NewCourseHandler(database *db.Database) *CourseHandler {
	return &CourseHandler{DB: database}
}

// GetCourseFilterOptions returns distinct values for division/field filters.
func (h *CourseHandler) GetCourseFilterOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	divisions, fields, err := h.DB.GetCourseFilterOptions()
	if err != nil {
		http.Error(w, "Failed to get filter options", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CourseFilterOptionsResponse{Divisions: divisions, Fields: fields})
}

// GetCourses returns a list of courses with optional filtering
func (h *CourseHandler) GetCourses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	query := r.URL.Query()
	filter := models.CourseFilter{
		Division: query.Get("division"),
		Field:    query.Get("field"),
		Area:     query.Get("area"),
		Search:   query.Get("search"),
		Limit:    10, // Default limit
		Offset:   0,
	}

	if limitStr := query.Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			if limit > 100 {
				limit = 100
			}
			filter.Limit = limit
		}
	}

	if offsetStr := query.Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil && offset >= 0 {
			filter.Offset = offset
		}
	}

	// Get courses from database
	courses, total, err := h.DB.GetCourses(filter)
	if err != nil {
		http.Error(w, "Failed to get courses", http.StatusInternalServerError)
		return
	}

	response := models.CourseListResponse{
		Total:   total,
		Courses: courses,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetCourse returns a single course by ID
func (h *CourseHandler) GetCourse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid course ID", http.StatusBadRequest)
		return
	}

	idStr := pathParts[len(pathParts)-1]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid course ID", http.StatusBadRequest)
		return
	}

	course, err := h.DB.GetCourseByID(id)
	if err != nil {
		http.Error(w, "Failed to get course", http.StatusInternalServerError)
		return
	}

	if course == nil {
		http.Error(w, "Course not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(course)
}

// GetRecommendedAlternatives returns recommended alternative courses
func (h *CourseHandler) GetRecommendedAlternatives(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract course ID from query
	courseIDStr := r.URL.Query().Get("course_id")
	if courseIDStr == "" {
		http.Error(w, "course_id is required", http.StatusBadRequest)
		return
	}

	courseID, err := strconv.Atoi(courseIDStr)
	if err != nil {
		http.Error(w, "Invalid course_id", http.StatusBadRequest)
		return
	}

	limit := 10
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	courses, err := h.DB.GetRecommendedAlternatives(courseID, limit)
	if err != nil {
		http.Error(w, "Failed to get alternatives", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"courses": courses,
	})
}
