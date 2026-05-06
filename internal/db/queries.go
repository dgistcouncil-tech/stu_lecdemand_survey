package db

import (
	"course-survey/internal/models"
	"database/sql"
	"fmt"
	"strings"
)

// Student queries

func (d *Database) GetStudentByStudentID(studentID string) (*models.Student, error) {
	var student models.Student
	query := `SELECT id, student_id, name, password, major, minor, current_year,
			  special_notes, is_submitted, created_at, updated_at
			  FROM students WHERE student_id = ?`

	err := d.DB.QueryRow(query, studentID).Scan(
		&student.ID, &student.StudentID, &student.Name, &student.Password,
		&student.Major, &student.Minor, &student.CurrentYear, &student.SpecialNotes,
		&student.IsSubmitted, &student.CreatedAt, &student.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &student, nil
}

func (d *Database) GetStudentByID(id int) (*models.Student, error) {
	var student models.Student
	query := `SELECT id, student_id, name, major, minor, current_year,
			  special_notes, is_submitted, created_at, updated_at
			  FROM students WHERE id = ?`

	err := d.DB.QueryRow(query, id).Scan(
		&student.ID, &student.StudentID, &student.Name,
		&student.Major, &student.Minor, &student.CurrentYear,
		&student.SpecialNotes, &student.IsSubmitted,
		&student.CreatedAt, &student.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &student, nil
}

func (d *Database) CreateStudent(student *models.Student) error {
	query := `INSERT INTO students (student_id, name, password, major, minor,
			  current_year, special_notes) VALUES (?, ?, ?, ?, ?, ?, ?)`

	result, err := d.DB.Exec(query, student.StudentID, student.Name, student.Password,
		student.Major, student.Minor, student.CurrentYear, student.SpecialNotes)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	student.ID = int(id)
	return nil
}

func (d *Database) UpdateStudentSubmitStatus(studentID int, isSubmitted bool) error {
	query := `UPDATE students SET is_submitted = ?, updated_at = CURRENT_TIMESTAMP
			  WHERE id = ?`
	_, err := d.DB.Exec(query, isSubmitted, studentID)
	return err
}

// Course queries

func (d *Database) GetCourseFilterOptions() (divisions []string, fields []string, err error) {
	divRows, err := d.DB.Query(`SELECT DISTINCT division FROM courses WHERE is_active = TRUE AND division IS NOT NULL AND division != '' ORDER BY division`)
	if err != nil {
		return nil, nil, err
	}
	defer divRows.Close()

	for divRows.Next() {
		var v sql.NullString
		if err := divRows.Scan(&v); err != nil {
			return nil, nil, err
		}
		if v.Valid && v.String != "" {
			divisions = append(divisions, v.String)
		}
	}
	if err := divRows.Err(); err != nil {
		return nil, nil, err
	}

	fieldRows, err := d.DB.Query(`SELECT DISTINCT field FROM courses WHERE is_active = TRUE AND field IS NOT NULL AND field != '' ORDER BY field`)
	if err != nil {
		return nil, nil, err
	}
	defer fieldRows.Close()

	for fieldRows.Next() {
		var v sql.NullString
		if err := fieldRows.Scan(&v); err != nil {
			return nil, nil, err
		}
		if v.Valid && v.String != "" {
			fields = append(fields, v.String)
		}
	}
	if err := fieldRows.Err(); err != nil {
		return nil, nil, err
	}

	return divisions, fields, nil
}

func (d *Database) GetCourses(filter models.CourseFilter) ([]models.Course, int, error) {
	var courses []models.Course
	var conditions []string
	var args []interface{}

	baseQuery := `SELECT id, course_code, course_name, professor, division, field,
				  area, credits, syllabus_link, schedule FROM courses`

	// Only show active courses in search/listing.
	conditions = append(conditions, "is_active = TRUE")

	if filter.Division != "" {
		conditions = append(conditions, "division = ?")
		args = append(args, filter.Division)
	}
	if filter.Field != "" {
		conditions = append(conditions, "field = ?")
		args = append(args, filter.Field)
	}
	if filter.Area != "" {
		conditions = append(conditions, "area = ?")
		args = append(args, filter.Area)
	}
	if filter.Search != "" {
		conditions = append(conditions, "(course_name LIKE ? OR course_code LIKE ? OR professor LIKE ?)")
		searchPattern := "%" + filter.Search + "%"
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM courses" + whereClause
	var total int
	if err := d.DB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Get paginated results
	query := baseQuery + whereClause + " ORDER BY course_code LIMIT ? OFFSET ?"
	args = append(args, filter.Limit, filter.Offset)

	rows, err := d.DB.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var course models.Course
		err := rows.Scan(&course.ID, &course.CourseCode, &course.CourseName,
			&course.Professor, &course.Division, &course.Field, &course.Area,
			&course.Credits, &course.SyllabusLink, &course.Schedule)
		if err != nil {
			return nil, 0, err
		}
		courses = append(courses, course)
	}

	return courses, total, nil
}

func (d *Database) GetCourseByID(id int) (*models.Course, error) {
	var course models.Course
	query := `SELECT id, course_code, course_name, professor, division, field,
			  area, credits, syllabus_link, schedule FROM courses WHERE id = ?`

	err := d.DB.QueryRow(query, id).Scan(
		&course.ID, &course.CourseCode, &course.CourseName, &course.Professor,
		&course.Division, &course.Field, &course.Area, &course.Credits,
		&course.SyllabusLink, &course.Schedule,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &course, nil
}

func (d *Database) CreateCourse(course *models.Course) error {
	// Upsert by (course_code, professor) so updated CSV content is reflected
	// without requiring the courses table to be empty.
	query := `INSERT INTO courses (course_code, course_name, professor, division,
			  field, area, credits, syllabus_link, schedule, is_active)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
			  ON CONFLICT(course_code, professor) DO UPDATE SET
			  course_name = excluded.course_name,
			  division = excluded.division,
			  field = excluded.field,
			  area = excluded.area,
			  credits = excluded.credits,
			  syllabus_link = excluded.syllabus_link,
			  schedule = excluded.schedule,
			  is_active = TRUE`

	_, err := d.DB.Exec(query,
		course.CourseCode, course.CourseName, course.Professor,
		course.Division, course.Field, course.Area,
		course.Credits, course.SyllabusLink, course.Schedule,
	)
	return err
}

// Selection queries

func (d *Database) GetSelectionsByStudent(studentID int) ([]models.SelectionWithCourse, error) {
	query := `
		SELECT cs.id, cs.student_id, cs.course_id, cs.priority,
			   cs.professor_1st, cs.professor_2nd, cs.professor_3rd,
			   cs.is_alternative, cs.parent_selection_id, cs.alternative_priority,
			   cs.created_at, cs.updated_at,
			   c.id, c.course_code, c.course_name, c.professor, c.division,
			   c.field, c.area, c.credits, c.syllabus_link, c.schedule
		FROM course_selections cs
		JOIN courses c ON cs.course_id = c.id
		WHERE cs.student_id = ? AND cs.is_alternative = FALSE
		ORDER BY cs.priority
	`

	rows, err := d.DB.Query(query, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var selections []models.SelectionWithCourse
	for rows.Next() {
		var sel models.SelectionWithCourse
		var parentID sql.NullInt64
		var altPriority sql.NullInt64

		err := rows.Scan(
			&sel.ID, &sel.StudentID, &sel.CourseID, &sel.Priority,
			&sel.Professor1st, &sel.Professor2nd, &sel.Professor3rd,
			&sel.IsAlternative, &parentID, &altPriority,
			&sel.CreatedAt, &sel.UpdatedAt,
			&sel.Course.ID, &sel.Course.CourseCode, &sel.Course.CourseName,
			&sel.Course.Professor, &sel.Course.Division, &sel.Course.Field,
			&sel.Course.Area, &sel.Course.Credits, &sel.Course.SyllabusLink,
			&sel.Course.Schedule,
		)
		if err != nil {
			return nil, err
		}

		if parentID.Valid {
			id := int(parentID.Int64)
			sel.ParentSelectionID = &id
		}
		if altPriority.Valid {
			priority := int(altPriority.Int64)
			sel.AlternativePriority = &priority
		}

		// Get alternatives for this selection
		alternatives, err := d.GetAlternatives(sel.ID)
		if err != nil {
			return nil, err
		}
		sel.Alternatives = alternatives

		selections = append(selections, sel)
	}

	return selections, nil
}

func (d *Database) GetAlternatives(parentSelectionID int) ([]models.SelectionWithCourse, error) {
	query := `
		SELECT cs.id, cs.student_id, cs.course_id, cs.priority,
			   cs.professor_1st, cs.professor_2nd, cs.professor_3rd,
			   cs.is_alternative, cs.parent_selection_id, cs.alternative_priority,
			   cs.created_at, cs.updated_at,
			   c.id, c.course_code, c.course_name, c.professor, c.division,
			   c.field, c.area, c.credits, c.syllabus_link, c.schedule
		FROM course_selections cs
		JOIN courses c ON cs.course_id = c.id
		WHERE cs.parent_selection_id = ?
		ORDER BY cs.alternative_priority
	`

	rows, err := d.DB.Query(query, parentSelectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alternatives []models.SelectionWithCourse
	for rows.Next() {
		var sel models.SelectionWithCourse
		var parentID sql.NullInt64
		var altPriority sql.NullInt64

		err := rows.Scan(
			&sel.ID, &sel.StudentID, &sel.CourseID, &sel.Priority,
			&sel.Professor1st, &sel.Professor2nd, &sel.Professor3rd,
			&sel.IsAlternative, &parentID, &altPriority,
			&sel.CreatedAt, &sel.UpdatedAt,
			&sel.Course.ID, &sel.Course.CourseCode, &sel.Course.CourseName,
			&sel.Course.Professor, &sel.Course.Division, &sel.Course.Field,
			&sel.Course.Area, &sel.Course.Credits, &sel.Course.SyllabusLink,
			&sel.Course.Schedule,
		)
		if err != nil {
			return nil, err
		}

		if parentID.Valid {
			id := int(parentID.Int64)
			sel.ParentSelectionID = &id
		}
		if altPriority.Valid {
			priority := int(altPriority.Int64)
			sel.AlternativePriority = &priority
		}

		alternatives = append(alternatives, sel)
	}

	return alternatives, nil
}

func (d *Database) CreateSelection(selection *models.CourseSelection) error {
	query := `INSERT INTO course_selections (student_id, course_id, priority,
			  professor_1st, professor_2nd, professor_3rd, is_alternative,
			  parent_selection_id, alternative_priority)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	result, err := d.DB.Exec(query, selection.StudentID, selection.CourseID,
		selection.Priority, selection.Professor1st, selection.Professor2nd,
		selection.Professor3rd, selection.IsAlternative, selection.ParentSelectionID,
		selection.AlternativePriority)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	selection.ID = int(id)
	return nil
}

func (d *Database) UpdateSelection(id int, professor1st, professor2nd, professor3rd string) error {
	query := `UPDATE course_selections
			  SET professor_1st = ?, professor_2nd = ?, professor_3rd = ?,
			      updated_at = CURRENT_TIMESTAMP
			  WHERE id = ?`
	_, err := d.DB.Exec(query, professor1st, professor2nd, professor3rd, id)
	return err
}

func (d *Database) DeleteSelection(id int) error {
	query := `DELETE FROM course_selections WHERE id = ?`
	_, err := d.DB.Exec(query, id)
	return err
}

func (d *Database) GetTotalCredits(studentID int) (float64, error) {
	query := `
		SELECT COALESCE(SUM(c.credits), 0)
		FROM course_selections cs
		JOIN courses c ON cs.course_id = c.id
		WHERE cs.student_id = ? AND cs.is_alternative = FALSE
	`

	var total float64
	err := d.DB.QueryRow(query, studentID).Scan(&total)
	return total, err
}

func (d *Database) IsCourseSelected(studentID, courseID int) (bool, error) {
	query := `SELECT COUNT(*) FROM course_selections
			  WHERE student_id = ? AND course_id = ?`

	var count int
	err := d.DB.QueryRow(query, studentID, courseID).Scan(&count)
	return count > 0, err
}

func (d *Database) IsPriorityTaken(studentID, priority int) (bool, error) {
	query := `SELECT COUNT(*) FROM course_selections
			  WHERE student_id = ? AND priority = ? AND is_alternative = FALSE`

	var count int
	err := d.DB.QueryRow(query, studentID, priority).Scan(&count)
	return count > 0, err
}

func (d *Database) GetRecommendedAlternatives(courseID int, limit int) ([]models.Course, error) {
	// Get the course info first
	course, err := d.GetCourseByID(courseID)
	if err != nil || course == nil {
		return nil, fmt.Errorf("course not found")
	}

	// Find courses with same division and field
	query := `SELECT id, course_code, course_name, professor, division, field,
			  area, credits, syllabus_link, schedule
			  FROM courses
			  WHERE is_active = TRUE AND id != ? AND (division = ? OR field = ?)
			  ORDER BY
			    CASE WHEN division = ? AND field = ? THEN 1
			         WHEN division = ? THEN 2
			         WHEN field = ? THEN 3
			         ELSE 4 END
			  LIMIT ?`

	rows, err := d.DB.Query(query, courseID, course.Division, course.Field,
		course.Division, course.Field, course.Division, course.Field, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var courses []models.Course
	for rows.Next() {
		var c models.Course
		err := rows.Scan(&c.ID, &c.CourseCode, &c.CourseName, &c.Professor,
			&c.Division, &c.Field, &c.Area, &c.Credits, &c.SyllabusLink, &c.Schedule)
		if err != nil {
			return nil, err
		}
		courses = append(courses, c)
	}

	return courses, nil
}
