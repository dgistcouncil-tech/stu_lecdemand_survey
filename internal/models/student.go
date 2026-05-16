package models

import "time"

type Student struct {
	ID           int       `json:"id"`
	StudentID    string    `json:"student_id"`
	Name         string    `json:"name"`
	Password     string    `json:"-"` // 비밀번호는 JSON에 포함하지 않음
	Major        string    `json:"major"`
	Minor        string    `json:"minor"`
	CurrentYear  string    `json:"current_year"`
	SpecialNotes string    `json:"special_notes"`
	IsSubmitted  bool      `json:"is_submitted"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type LoginRequest struct {
	StudentID      string `json:"student_id"`
	Name           string `json:"name"`
	Password       string `json:"password"`
	Major          string `json:"major,omitempty"`
	Minor          string `json:"minor,omitempty"`
	CurrentYear    string `json:"current_year,omitempty"`
	SpecialNotes   string `json:"special_notes,omitempty"`
	IsRegistration bool   `json:"is_registration,omitempty"`
}

type LoginResponse struct {
	Success   bool     `json:"success"`
	IsNewUser bool     `json:"is_new_user"`
	Student   *Student `json:"student,omitempty"`
	Token     string   `json:"token,omitempty"`
	Message   string   `json:"message,omitempty"`
}
