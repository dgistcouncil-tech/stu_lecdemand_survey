package api

import (
	"course-survey/internal/db"
	"course-survey/internal/middleware"
	"course-survey/internal/models"
	"course-survey/internal/util"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"time"
)

type AuthHandler struct {
	DB *db.Database
}

func NewAuthHandler(database *db.Database) *AuthHandler {
	return &AuthHandler{DB: database}
}

type loginResult struct {
	Student   *models.Student
	IsNewUser bool
	Token     string
}

type loginFailure struct {
	Code   string
	Status int
}

func (h *AuthHandler) performLogin(req *models.LoginRequest) (*loginResult, *loginFailure) {
	// Validate required fields
	if req.StudentID == "" || req.Name == "" || req.Password == "" {
		return nil, &loginFailure{Code: "missing_fields", Status: http.StatusBadRequest}
	}

	// Check if student exists
	existingStudent, err := h.DB.GetStudentByStudentID(req.StudentID)
	if err != nil {
		return nil, &loginFailure{Code: "server_error", Status: http.StatusInternalServerError}
	}

	var student *models.Student
	var isNewUser bool

	if existingStudent == nil {
		// New user - create account
		hashedPassword, err := util.HashPassword(req.Password)
		if err != nil {
			return nil, &loginFailure{Code: "server_error", Status: http.StatusInternalServerError}
		}

		student = &models.Student{
			StudentID:    req.StudentID,
			Name:         req.Name,
			Password:     hashedPassword,
			Major:        req.Major,
			Minor:        req.Minor,
			CurrentYear:  req.CurrentYear,
			SpecialNotes: req.SpecialNotes,
			IsSubmitted:  false,
		}

		if err := h.DB.CreateStudent(student); err != nil {
			return nil, &loginFailure{Code: "server_error", Status: http.StatusInternalServerError}
		}

		isNewUser = true
	} else {
		// Existing user - verify password
		if !util.CheckPasswordHash(req.Password, existingStudent.Password) {
			return nil, &loginFailure{Code: "invalid_password", Status: http.StatusUnauthorized}
		}

		student = existingStudent
	}

	// Create session
	token, err := middleware.Store.CreateSession(student.ID)
	if err != nil {
		log.Printf("[LOGIN] Failed to create session: %v", err)
		return nil, &loginFailure{Code: "server_error", Status: http.StatusInternalServerError}
	}

	return &loginResult{Student: student, IsNewUser: isNewUser, Token: token}, nil
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   7200, // 2 hours
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})
}

// Login handles JSON login (used by API clients)
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	res, fail := h.performLogin(&req)
	if fail != nil {
		switch fail.Code {
		case "missing_fields":
			http.Error(w, "Student ID, name, and password are required", fail.Status)
		case "invalid_password":
			http.Error(w, "Invalid password", fail.Status)
		default:
			http.Error(w, "Internal server error", fail.Status)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	setSessionCookie(w, res.Token)

	response := models.LoginResponse{
		Success:   true,
		IsNewUser: res.IsNewUser,
		Student:   res.Student,
		Token:     res.Token,
	}

	json.NewEncoder(w).Encode(response)
}

// LoginForm handles browser form POST and redirects
func (h *AuthHandler) LoginForm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Redirect(w, r, "/login.html?error=server_error", http.StatusSeeOther)
		return
	}

	req := models.LoginRequest{
		StudentID:    r.FormValue("student_id"),
		Name:         r.FormValue("name"),
		Password:     r.FormValue("password"),
		Major:        r.FormValue("major"),
		Minor:        r.FormValue("minor"),
		CurrentYear:  r.FormValue("current_year"),
		SpecialNotes: r.FormValue("special_notes"),
	}

	res, fail := h.performLogin(&req)
	if fail != nil {
		http.Redirect(w, r, "/login.html?error="+url.QueryEscape(fail.Code), http.StatusSeeOther)
		return
	}

	setSessionCookie(w, res.Token)
	if res.Student.IsSubmitted {
		http.Redirect(w, r, "/result.html", http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, "/index.html", http.StatusSeeOther)
}

// GetMe returns current logged-in student info
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	studentID, ok := middleware.GetStudentIDFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	student, err := h.DB.GetStudentByID(studentID)
	if err != nil || student == nil {
		http.Error(w, "Student not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(student)
}

// Logout handles user logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err == nil {
		middleware.Store.DeleteSession(cookie.Value)
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
