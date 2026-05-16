package main

import (
	"course-survey/internal/api"
	"course-survey/internal/db"
	"course-survey/internal/middleware"
	"course-survey/internal/util"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	// Parse command line flags
	port := flag.String("port", "8080", "Port to run the server on")
	dbPath := flag.String("db", "survey.db", "Path to SQLite database file")
	flag.Parse()

	// Initialize database
	database, err := db.NewDatabase(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Load courses from CSV (upsert) so CSV updates are reflected on restart.
	if err := loadCoursesFromCSV(database); err != nil {
		log.Printf("Warning: Failed to load courses from CSV: %v", err)
	}

	// Initialize API handlers
	authHandler := api.NewAuthHandler(database)
	courseHandler := api.NewCourseHandler(database)
	selectionHandler := api.NewSelectionHandler(database)
	adminHandler := api.NewAdminHandler(database)

	// Setup routes
	mux := http.NewServeMux()

	// Static files
	webDir := "web"
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		// When running from embedded binary, serve from current dir
		webDir = "."
	}

	publicDir := filepath.Join(webDir, "public")
	templatesDir := filepath.Join(webDir, "templates")

	// Serve public files (CSS, JS, images, etc.)
	mux.Handle("/public/", http.StripPrefix("/public/", http.FileServer(http.Dir(publicDir))))

	// Serve HTML pages
	mux.HandleFunc("/", serveFile(filepath.Join(templatesDir, "login.html")))
	mux.HandleFunc("/login.html", serveFile(filepath.Join(templatesDir, "login.html")))
	// NOTE: http.ServeFile redirects "/index.html" -> "/"; use ServeContent to avoid that.
	mux.HandleFunc("/index.html", serveHTML(filepath.Join(templatesDir, "index.html")))
	mux.HandleFunc("/result.html", serveFile(filepath.Join(templatesDir, "result.html")))
	mux.HandleFunc("/admin.html", serveFile(filepath.Join(templatesDir, "admin.html")))

	// Browser form login (sets cookie + redirects)
	mux.HandleFunc("/login", authHandler.LoginForm)

	// API routes - Authentication
	mux.HandleFunc("/api/login", middleware.CORSMiddleware(authHandler.Login))
	mux.HandleFunc("/api/logout", middleware.CORSMiddleware(authHandler.Logout))
	mux.HandleFunc("/api/me", middleware.CORSMiddleware(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			authHandler.GetMe(w, r)
		case http.MethodPut:
			authHandler.UpdateMe(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// API routes - Courses
	mux.HandleFunc("/api/course-filters", middleware.CORSMiddleware(middleware.AuthMiddleware(courseHandler.GetCourseFilterOptions)))
	mux.HandleFunc("/api/courses", middleware.CORSMiddleware(middleware.AuthMiddleware(courseHandler.GetCourses)))
	mux.HandleFunc("/api/courses/", middleware.CORSMiddleware(middleware.AuthMiddleware(handleCoursesWithID(courseHandler))))
	mux.HandleFunc("/api/recommendations", middleware.CORSMiddleware(middleware.AuthMiddleware(courseHandler.GetRecommendedAlternatives)))

	// API routes - Selections
	mux.HandleFunc("/api/selections", middleware.CORSMiddleware(middleware.AuthMiddleware(handleSelectionsCRUD(selectionHandler))))
	// More specific route must be registered before the prefix route
	mux.HandleFunc("/api/selections/standalone-alternative", middleware.CORSMiddleware(middleware.AuthMiddleware(selectionHandler.CreateStandaloneAlternative)))
	mux.HandleFunc("/api/selections/", middleware.CORSMiddleware(middleware.AuthMiddleware(handleSelectionsWithID(selectionHandler))))
	mux.HandleFunc("/api/submit", middleware.CORSMiddleware(middleware.AuthMiddleware(selectionHandler.Submit)))
	mux.HandleFunc("/api/reopen", middleware.CORSMiddleware(middleware.AuthMiddleware(selectionHandler.Reopen)))

	// API routes - Admin
	mux.HandleFunc("/api/admin/export", middleware.CORSMiddleware(adminHandler.ExportResults))
	mux.HandleFunc("/api/admin/stats", middleware.CORSMiddleware(adminHandler.GetStats))

	// Start server
	addr := ":" + *port
	log.Printf("Server starting on http://localhost%s", addr)
	log.Printf("Database: %s", *dbPath)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func loadCoursesFromCSV(database *db.Database) error {
	var before int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM courses").Scan(&before)

	log.Println("Loading courses from CSV (upsert)...")

	// Try to read CSV file from multiple possible locations
	var file *os.File
	var err error

	csvPaths := []string{
		"reference/개설강좌.csv",
		"../../reference/개설강좌.csv",
		"../reference/개설강좌.csv",
	}

	for _, path := range csvPaths {
		file, err = os.Open(path)
		if err == nil {
			log.Printf("Reading CSV from: %s", path)
			break
		}
	}

	if file == nil {
		return fmt.Errorf("failed to find CSV file in any of the expected locations")
	}
	defer file.Close()

	courses, err := util.ParseCoursesCSV(file)
	if err != nil {
		return fmt.Errorf("failed to parse CSV: %w", err)
	}
	if len(courses) == 0 {
		return fmt.Errorf("parsed 0 courses from CSV (unexpected)")
	}

	// Sync behavior: mark all as inactive, then upsert active ones from CSV.
	if _, err := database.DB.Exec("UPDATE courses SET is_active = FALSE"); err != nil {
		return fmt.Errorf("failed to mark courses inactive: %w", err)
	}

	processed := 0
	failed := 0
	for i, course := range courses {
		if err := database.CreateCourse(&course); err != nil {
			failed++
			log.Printf("Warning: Failed to upsert course %s (%s): %v", course.CourseCode, course.Professor, err)
			continue
		}
		processed++
		if (i+1)%200 == 0 {
			log.Printf("Processed %d courses...", i+1)
		}
	}

	var after int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM courses").Scan(&after)
	log.Printf("Courses before: %d, after: %d (processed %d/%d, failed %d)", before, after, processed, len(courses), failed)
	return nil
}

func serveFile(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func serveHTML(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f, err := os.Open(path)
		if err != nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		defer f.Close()

		st, err := f.Stat()
		if err != nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeContent(w, r, st.Name(), st.ModTime(), f)
	}
}

func handleCoursesWithID(h *api.CourseHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if it's professors endpoint
		if strings.HasSuffix(r.URL.Path, "/professors") {
			if r.Method == http.MethodGet {
				h.GetProfessors(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Default: GetCourse
		if r.Method == http.MethodGet {
			h.GetCourse(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func handleSelectionsCRUD(h *api.SelectionHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetSelections(w, r)
		case http.MethodPost:
			h.CreateSelection(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func handleSelectionsWithID(h *api.SelectionHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if it's alternatives endpoint
		if strings.HasSuffix(r.URL.Path, "/alternatives") {
			if r.Method == http.MethodPost {
				h.CreateAlternative(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		// Check if it's priority endpoint
		if strings.HasSuffix(r.URL.Path, "/priority") {
			if r.Method == http.MethodPut {
				h.UpdatePriority(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		switch r.Method {
		case http.MethodPut:
			h.UpdateSelection(w, r)
		case http.MethodDelete:
			h.DeleteSelection(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
