import { Database, OPEN_READONLY, OPEN_READWRITE } from "sqlite3"
import path from 'path'
import fs from 'fs'
import Papa from 'papaparse'
import tables from "../db/tables"
import { regex } from "./regex"
import { DBRow } from "../../types/Database"

const dbPath = path.join(__dirname, '..', 'main', 'db', 'owlguide.db')

const getTablePage = (name: string, offset: number, limit: number): Promise<{ rows: DBRow[], total: number }> => {
    return new Promise((resolve, reject) => {
        const db = new Database(dbPath, OPEN_READONLY, (err) => {
            if (err) {
                reject(err)
            }
        })

        let total = 0
        db.serialize(() => {
            db.get(`SELECT COUNT(ID) FROM ${name}`, (err, result) => {
                if (err) {
                    reject(err)
                }
                total = result["COUNT(ID)"]
            })
            db.all(`SELECT * FROM ${name} LIMIT ?,?`, [(offset * limit), limit], (err, rows: DBRow[]) => {
                if (err) {
                    reject(err)
                }
                resolve({ rows, total })
            })
        })
        db.close((err) => {
            if (err) {
                reject(err)
            }
        })
    })
}

const getAllTermList = (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const db = new Database(dbPath, OPEN_READONLY, (err) => {
            if (err) {
                reject(err)
            }
        })

        db.all(`SELECT DISTINCT CONCAT(Term, Year) AS Term FROM Courses ORDER BY Term, Year`, (err, rows: DBRow[]) => {
            if (err) {
                reject(err)
            }
            const terms: string[] = []
            rows.forEach((row) => {
                terms.push(row.Term as string)
            })
            resolve(terms)
        })

        db.close((err) => {
            if (err) {
                reject(err)
            }
        })
    })
}

const getAllPrevSalesByBook = (term: string, year: string, isbn: string, title: string): Promise<DBRow[]> => {
    return new Promise((resolve, reject) => {
        const db = new Database(dbPath, OPEN_READONLY, (err) => {
            if (err) reject(err)
        })

        // Return EstEnrl, ActEnrl, and TotalSales for previous terms based on ISBN or Title and term
        db.all(`SELECT CONCAT(Sales.Term, Sales.Year) AS Term, Books.ISBN, Books.Title,
                    SUM(Courses.EstEnrl) AS EstEnrl,
                    SUM(Courses.ActEnrl) AS ActEnrl,
                    Sales.UsedSales + Sales.NewSales AS Sales
                FROM Courses
                JOIN Course_Book ON Course_Book.CourseID = Courses.ID
                JOIN Books ON Course_Book.BookID = Books.ID
                JOIN Sales ON Books.ID = Sales.BookID
                    AND Sales.Term = Courses.Term
                    AND Sales.Year = Courses.Year
                WHERE Books.ISBN = ?1 AND Books.Title = ?2
                    AND Courses.Term = ?3 
                    AND Courses.Year != ?4
                    AND Courses.Dept NOT IN ("SPEC", "CANC")
                GROUP BY Sales.Year
                ORDER BY Sales.Term`,
            [isbn, title, term, year], (err, rows: DBRow[]) => {
                if (err) reject(err)

                resolve(rows)
            })
    })
}

const getPrevSalesByBookArr = (term: string, year: string, books: (string | number)[][]): Promise<DBRow[]> => {
    const db = new Database(dbPath, OPEN_READONLY, (err) => {
        if (err) throw (err)
    })

    const rows: DBRow[] = []
    return new Promise((resolve, reject) => {
        try {
            const stmt = db.prepare(
                `SELECT Books.ISBN, Books.Title,
SUM(CASE WHEN Courses.Term = ?1 AND Courses.Year != ?2 THEN Courses.EstEnrl ELSE NULL END) AS PrevEstEnrl,
                    SUM(CASE WHEN Courses.Term = ?1 AND Courses.Year != ?2 THEN Courses.ActEnrl ELSE NULL END) AS PrevActEnrl,
                    SUM(CASE WHEN Courses.Term = ?1 AND Courses.Year = ?2 THEN Courses.EstEnrl ELSE 0 END) AS CurrEstEnrl,
                    SUM(CASE WHEN Courses.Term = ?1 AND Courses.Year = ?2 THEN Courses.ActEnrl ELSE 0 END) AS CurrActEnrl,
COALESCE(
        (SELECT SUM(Sales.UsedSales + Sales.NewSales)
         FROM Sales
         WHERE Sales.Term = ?1 
           AND Sales.Year != ?2
           AND Sales.BookID = Books.ID),
        0
    ) AS TotalSales,
    COALESCE(
        (SELECT Sales.EstSales
         FROM Sales
         WHERE Sales.Term = ?1 
           AND Sales.Year = ?2
           AND Sales.BookID = Books.ID),
        0
    ) AS CurrEstSales
    From Courses
JOIN Course_Book ON Courses.ID = Course_Book.CourseID
JOIN Books ON Course_Book.BookID = Books.ID
JOIN Sales ON Books.ID = Sales.BookID
WHERE Sales.Term = Courses.Term
AND Sales.Year = Courses.Year
AND Courses.Unit = "1"
AND Courses.Term = ?1
AND Courses.DEPT NOT IN ("SPEC", "CANC")
GROUP BY Books.ISBN, Books.Title
ORDER BY Books.Title
            `)

            stmt.all([term, year], (err, resultRows: DBRow[]) => {
                if (err) {
                    reject(`Error executing query: ${err.message}`)
                } else {
                    for (const row of resultRows) {
                        const matchedBook = books.find(([isbn, title]) => isbn === row.ISBN && title === row.Title)
                        if (matchedBook) {
                            if (matchedBook[2]) {
                                row.Decision = matchedBook[2]
                            }
                            rows.push(row)
                        }
                    }
                    stmt.finalize((err) => {
                        if (err) {
                            reject(`Error finalizing statement: ${err.message}`)
                        } else {
                            db.close((err) => {
                                if (err) {
                                    reject(`Error closing database: ${err.message}`)
                                } else {
                                    resolve(rows)
                                }
                            })
                        }
                    })
                }
            })
        } catch (error) {
            reject(error)
        }
    })
}

const getBooksByTerm = async (term: string, year: string): Promise<DBRow[]> => {
    const db = new Database(dbPath, OPEN_READONLY, (err) => {
        if (err) throw err
    })

    try {
        return new Promise((resolve, reject) => {
            db.all(`SELECT Books.ISBN, Books.Title FROM Books 
                JOIN Sales on Books.ID = Sales.BookID
                WHERE Sales.Term=? AND Sales.Year=?`,
                [term, year], (err, rows: DBRow[]) => {
                    if (err) reject(err)
                    resolve(rows)
                })
        })
    } catch (error) {
        throw error
    } finally {
        db.close((err) => { if (err) throw err })
    }
}

const getCourseDataByTerm = async (term: string, year: string): Promise<DBRow[]> => {
    const db = new Database(dbPath, OPEN_READONLY, (err) => {
        if (err) throw (err)
    })

    return new Promise((resolve, reject) => {
        try {
            db.all(`SELECT Courses.ID, Courses.CRN, Courses.Dept, Courses.SectionNum AS Section 
                FROM Courses
                WHERE Courses.Term = ? 
                    AND Courses.Year = ?
                    AND Courses.Dept NOT IN ("SPEC", "CANC")`,
                [term, year], (err, rows: DBRow[]) => {
                    if (err) reject(err)
                    resolve(rows)
                })
        } finally {
            db.close((err) => {
                if (err) reject(`Error closing database: ${err}`)
            })
        }
    })
}

const buildTableSchema = (sqlHeader) => {
    const keys = Object.keys(sqlHeader)
    const columns = keys.map((key, i) => `${key} ${sqlHeader[key].type}`).join(", ")
    const foreignKeys = keys
        .map((key, i) => {
            const foreignKey = sqlHeader[key].foreignKey
            return foreignKey
                ? `FOREIGN KEY (${key}) REFERENCES ${foreignKey.references} ${foreignKey.onDelete ? `ON DELETE ${foreignKey.onDelete}` : ""} ${foreignKey.onUpdate ? `ON UPDATE ${foreignKey.onUpdate}` : ""}`
                : null
        })
        .filter(Boolean)
        .join(", ")
    return `(${columns}${foreignKeys ? `, ${foreignKeys}` : ""})`
}

const replaceTable = (filePath: string): Promise<void> => {
    // Retrieve CSV table name from uploaded file path
    // Find the table name that corresponds to the CSV name
    const matchName = regex.matchFileName(filePath)
    const name = Object.keys(tables).find(key => tables[key].TableName === matchName)

    const db = new Database(dbPath, OPEN_READWRITE, (err) => { if (err) return err })
    const tableData = tables[name]

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath)
        // Headers that will be used for SQL Table
        const sqlHeader = tableData["TableHeaders"]
        const tableSchema = buildTableSchema(sqlHeader)
        // Only insert values for headers that are meant to be inserted
        const insertKeys = Object.keys(sqlHeader).filter(key => sqlHeader[key].insert)
        // Create question mark placeholders for number of inserts
        const placeholders = insertKeys.map(() => "?").join(", ")
        const insertStatement = `INSERT INTO ${name} (${insertKeys.join(", ")}) VALUES (${placeholders})`

        Papa.parse(stream, {
            beforeFirstChunk: (chunk) => {
                // CSV doesn't include header so needs to be added on first chunk of data
                const lines = chunk.split("\n")
                const header = tableData["CSVHeaders"].join(",")

                const newChunk = [header, ...lines].join("\n")
                return newChunk
            },
            header: true,
            complete: async (results) => {
                const csvResults = results.data
                try {
                    db.serialize(() => {
                        db.run(`DROP TABLE IF EXISTS ${name}`)
                        db.run(`CREATE TABLE IF NOT EXISTS ${name} ${tableSchema}`, (err) => {
                            if (err) return reject(`Error creating ${name} Table: ${err}`)
                        })

                        for (const index of tableData["Indexes"]) {
                            db.run(`CREATE INDEX idx_${name.toLowerCase()}_${(index.split(", ").join("_").toLowerCase())} ON ${name}(${index})`, (err) => {
                                if (err) console.warn(`Error creating index for table ${name}`)
                            })

                        }
                        db.run("BEGIN TRANSACTION", (err) => {
                            if (err) return reject(`Error starting transaction: ${err}`)
                        })

                        const stmt = db.prepare(insertStatement)
                        csvResults.forEach(row => {
                            const values = insertKeys.map(key => {
                                const csvRef = sqlHeader[key].csvRef
                                // Check if csvRef is an array and join values as strings if so
                                if (Array.isArray(csvRef)) {
                                    return csvRef.map(ref => row[ref] || "").join("")
                                }
                                return row[csvRef]
                            })

                            stmt.run(values, (err) => {
                                // Check if the error message contains "constraint"
                                if (err && !/constraint/i.test(err.message)) console.warn(`Error inserting row: ${err}`)
                            })
                        })

                        stmt.finalize((err) => {
                            if (err) return reject(`Error finalizing statement: ${err}`)

                            db.run("COMMIT", (err) => {
                                if (err) return reject(`Error committing transaction: ${err}`)
                                resolve()
                            })
                        })
                    })
                } catch (err) {
                    db.run("ROLLBACK")
                    reject(err)
                } finally {
                    db.close((err) => {
                        if (err) reject(`Error closing database: ${err}`)
                    })
                }
            }
        })
    })
}


export const sqlDB = {
    all: { getTablePage, getAllTermList },
    sales: { getPrevSalesByBookArr, getAllPrevSalesByBook },
    books: { getBooksByTerm },
    courses: { getCourseDataByTerm },
    tables: { replaceTable }
}