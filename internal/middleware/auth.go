package middleware

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"
)

type SessionStore struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

type Session struct {
	StudentID int
	ExpiresAt time.Time
}

var Store = &SessionStore{
	sessions: make(map[string]*Session),
}

func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func (s *SessionStore) CreateSession(studentID int) (string, error) {
	token, err := GenerateToken()
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.sessions[token] = &Session{
		StudentID: studentID,
		ExpiresAt: time.Now().Add(2 * time.Hour),
	}

	return token, nil
}

func (s *SessionStore) GetSession(token string) (*Session, bool) {
	s.mu.RLock()
	session, exists := s.sessions[token]
	s.mu.RUnlock()

	if !exists {
		return nil, false
	}

	if time.Now().After(session.ExpiresAt) {
		s.mu.Lock()
		delete(s.sessions, token)
		s.mu.Unlock()
		return nil, false
	}

	return session, true
}

func (s *SessionStore) DeleteSession(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
}

func (s *SessionStore) CleanupExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for token, session := range s.sessions {
		if now.After(session.ExpiresAt) {
			delete(s.sessions, token)
		}
	}
}

// AuthMiddleware checks for valid session via cookie or Authorization header.
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var token string

		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			token = auth[7:]
		}

		if token == "" {
			if cookie, err := r.Cookie("session_token"); err == nil {
				token = cookie.Value
			}
		}

		if token == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		session, valid := Store.GetSession(token)
		if !valid {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "student_id", session.StudentID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func GetStudentIDFromContext(r *http.Request) (int, bool) {
	studentID, ok := r.Context().Value("student_id").(int)
	return studentID, ok
}

func init() {
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			Store.CleanupExpired()
		}
	}()
}
