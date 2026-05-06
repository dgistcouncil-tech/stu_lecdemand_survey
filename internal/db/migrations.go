package db

import (
	"database/sql"
	"log"
)

// Migrate creates all necessary tables
func (d *Database) Migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS students (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_id VARCHAR(20) UNIQUE NOT NULL,
			name VARCHAR(50) NOT NULL,
			password VARCHAR(255) NOT NULL,
			major VARCHAR(100),
			minor VARCHAR(100),
			current_year VARCHAR(10),
			special_notes TEXT,
			is_submitted BOOLEAN DEFAULT FALSE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS courses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			course_code VARCHAR(20) NOT NULL,
			course_name VARCHAR(200) NOT NULL,
			professor VARCHAR(100) NOT NULL,
			division VARCHAR(50),
			field VARCHAR(100),
			area VARCHAR(100),
			credits DECIMAL(2,1),
			syllabus_link TEXT,
			schedule TEXT,
			UNIQUE(course_code, professor)
		)`,
		`CREATE TABLE IF NOT EXISTS course_selections (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_id INTEGER NOT NULL,
			course_id INTEGER NOT NULL,
			priority INTEGER NOT NULL,
			professor_1st VARCHAR(100),
			professor_2nd VARCHAR(100),
			professor_3rd VARCHAR(100),
			is_alternative BOOLEAN DEFAULT FALSE,
			parent_selection_id INTEGER,
			alternative_priority INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
			FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
			FOREIGN KEY (parent_selection_id) REFERENCES course_selections(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id)`,
		`CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(course_code)`,
		`CREATE INDEX IF NOT EXISTS idx_courses_division ON courses(division)`,
		`CREATE INDEX IF NOT EXISTS idx_courses_field ON courses(field)`,
		`CREATE INDEX IF NOT EXISTS idx_selections_student ON course_selections(student_id)`,
		`CREATE INDEX IF NOT EXISTS idx_selections_priority ON course_selections(priority)`,
	}

	for _, migration := range migrations {
		if _, err := d.DB.Exec(migration); err != nil {
			return err
		}
	}

	if err := d.ensureCoursesIsActiveColumn(); err != nil {
		return err
	}

	log.Println("Database migrations completed")
	return nil
}

func (d *Database) ensureCoursesIsActiveColumn() error {
	rows, err := d.DB.Query("PRAGMA table_info(courses)")
	if err != nil {
		return err
	}
	defer rows.Close()

	exists := false
	for rows.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "is_active" {
			exists = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if exists {
		return nil
	}

	if _, err := d.DB.Exec("ALTER TABLE courses ADD COLUMN is_active BOOLEAN DEFAULT TRUE"); err != nil {
		return err
	}
	_, _ = d.DB.Exec("UPDATE courses SET is_active = TRUE WHERE is_active IS NULL")
	_, _ = d.DB.Exec("CREATE INDEX IF NOT EXISTS idx_courses_is_active ON courses(is_active)")
	return nil
}
