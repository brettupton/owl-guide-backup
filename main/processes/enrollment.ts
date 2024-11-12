import { CSVCourse, XLSXCourse } from "../../types/Enrollment"
import { fileSys, bSQLDB, regex } from "../utils"
import Papa from 'papaparse'

const matchEnrollment = async (filePath: string) => {
    try {
        const fileData: XLSXCourse[] = await fileSys.xlsx.read(filePath, 'enrollment')
        const newEnrl: string[][] = []

        const [term = null, year = null] = regex.matchFileTermYear(filePath) || []
        if (!term) throw `Unexpected file name. Rename with term and try again.`

        const { queryResult, totalRowCount } = await bSQLDB.courses.getCoursesByTerm(term, year)
        fileData.forEach((course) => {
            // Verify all needed fields exist in course
            const requiredFields = [
                "COURSE REFERENCE NUMBER",
                "CAMPUS",
                "SUBJECT",
                "COURSE NUMBER",
                "MAXIMUM ENROLLMENT",
                "ACTUAL ENROLLMENT",
                "TITLE"
            ]

            for (const field of requiredFields) {
                if (course[field] === undefined) {
                    throw new Error(`Missing value for required field: ${field}\n${JSON.stringify(course)}`)
                }
            }

            // Don't include cancelled courses
            if (course["TITLE"] === "CANCELLED") return

            const CRN = course["COURSE REFERENCE NUMBER"].toString()
            // If no offering number, find potential match from database
            const oNum = course["OFFERING NUMBER"] ?? findSectionNum(queryResult, CRN)
            const prof = course["PRIMARY INSTRUCTOR LAST NAME"] ? course["PRIMARY INSTRUCTOR LAST NAME"].toString().toUpperCase() : "TBD"

            newEnrl.push([
                course["CAMPUS"].toString(),
                course["SUBJECT"].toString(),
                course["COURSE NUMBER"].toString(),
                oNum,
                prof,
                course["MAXIMUM ENROLLMENT"].toString(),
                course["ACTUAL ENROLLMENT"].toString(),
                course["TITLE"].toString(),
                CRN
            ])
        })

        return { enrollment: newEnrl, filePath }
    } catch (error) {
        throw error
    }
}

const findSectionNum = (termData, CRN: string): string => {
    const foundCourse = termData.find(course => course["CRN"] != null && course["CRN"].toString() === CRN)

    return foundCourse ? foundCourse["Section"] : "0"
}

const submitEnrollment = async (enrollment: string[][], filePath: string) => {
    try {
        const fileName = regex.matchFileName(filePath)
        const [term = null, year = null] = regex.matchFileTermYear(filePath) || []
        if (!fileName) throw `Unexpected file name. Rename with term and try again.`

        const csv = createCourseCSV(enrollment, term, year)
        return { fileName, csv }
    } catch (error) {
        throw error
    }
}

const createCourseCSV = (enrollment: string[][], term: string, year: string) => {
    const csvCourses: CSVCourse[] = []

    enrollment.forEach((course) => {
        const newCourse: CSVCourse = {
            "UnitNumber": course[0] === "MPC" ? "1" : "2",
            "Term": term,
            "Year": year,
            "DepartmentName": course[1],
            "CourseNumber": course[2],
            "SectionNumber": course[3].toString().padStart(3, "0"),
            "ProfessorName": course[4],
            "MaximumCapacity": course[5],
            "EstPreEnrollment": course[5],
            "ActualEnrollment": course[6],
            "ContinuationClass": "",
            "EveningClass": "",
            "ExtensionClass": "",
            "TextnetFlag": "",
            "Location": "",
            "CourseTitle": course[7],
            "CourseID": course[8]
        }
        csvCourses.push(newCourse)
    })

    return Papa.unparse(csvCourses)
}


export { matchEnrollment, submitEnrollment }