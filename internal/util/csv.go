package util

import (
	"course-survey/internal/models"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
)

func normalizeHeader(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "\ufeff")
	return s
}

func getField(record []string, idx int) string {
	if idx < 0 || idx >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[idx])
}

// ParseCoursesCSV parses 개설강좌.csv.
// NOTE: The file begins with a title row and empty row; the real header row starts with "NO".
func ParseCoursesCSV(reader io.Reader) ([]models.Course, error) {
	csvReader := csv.NewReader(reader)
	csvReader.FieldsPerRecord = -1
	csvReader.LazyQuotes = true

	// Find header row
	var header []string
	for {
		rec, err := csvReader.Read()
		if err == io.EOF {
			return nil, fmt.Errorf("failed to find header row")
		}
		if err != nil {
			return nil, fmt.Errorf("error reading CSV header: %w", err)
		}
		if len(rec) == 0 {
			continue
		}
		first := normalizeHeader(rec[0])
		if first == "NO" {
			header = rec
			break
		}
	}

	idx := map[string]int{}
	for i, h := range header {
		idx[normalizeHeader(h)] = i
	}

	indexOf := func(keys ...string) int {
		for _, k := range keys {
			if i, ok := idx[k]; ok {
				return i
			}
		}
		return -1
	}

	idxCourseCode := indexOf("과목번호")
	idxCourseName := indexOf("교과목명")
	idxProfessor := indexOf("담당교수")
	if idxCourseCode < 0 || idxCourseName < 0 || idxProfessor < 0 {
		return nil, fmt.Errorf("missing required columns (과목번호/교과목명/담당교수)")
	}

	idxDivision := indexOf("이수구분")
	idxField := indexOf("교과분야", "과목구분")
	idxArea := indexOf("교과영역", "과목세부구분")
	idxCredits := indexOf("학점")
	idxSchedule := indexOf("요일/교시/강의실")

	var courses []models.Course
	lineNum := 0

	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("error reading CSV at data line %d: %w", lineNum, err)
		}
		lineNum++

		// Skip empty rows
		if len(record) == 0 || strings.TrimSpace(record[0]) == "" {
			continue
		}

		credits := 0.0
		creditsRaw := getField(record, idxCredits)
		if creditsRaw != "" {
			if v, err := strconv.ParseFloat(creditsRaw, 64); err == nil {
				credits = v
			}
		}

		course := models.Course{
			CourseCode: getField(record, idxCourseCode),
			CourseName: getField(record, idxCourseName),
			Professor:  getField(record, idxProfessor),
			Division:   getField(record, idxDivision),
			Field:      getField(record, idxField),
			Area:       getField(record, idxArea),
			Credits:    credits,
			Schedule:   getField(record, idxSchedule),
		}

		// Skip courses with empty essential fields
		if course.CourseCode == "" || course.CourseName == "" || course.Professor == "" {
			continue
		}

		courses = append(courses, course)
	}

	return courses, nil
}
