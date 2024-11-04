import { Decision, SQLDecision } from "../../types/Decision"
import { fileSys, regex, sqlDB } from "../utils"

const getTermDecisions = async (fullTerm: string) => {
    try {
        const [term = null, year = null] = regex.splitFullTerm(fullTerm) || []
        if (!term || !year) throw `Unexpected term or year.`

        const termBooks = await sqlDB.books.getBooksByTerm(term, year)
        const books = termBooks.map((book) => {
            return [book.ISBN as string, book.Title as string]
        })


        const termData = await sqlDB.sales.getPrevSalesByBookArr(term, year, books)
        const decisions: Decision[] = []

        termData.forEach((book: SQLDecision) => {
            const decision = calculateDecision(book)
            decisions.push(decision)
        })

        return { decisions, term: term + year }
    } catch (error) {
        throw error
    }
}

const getFileDecisions = async (filePath: string) => {
    try {
        const fileData: { [field: string]: string | number }[] = await fileSys.xlsx.read(filePath, "decision")

        const fileBooks: (string | number)[][] = []
        const fileTerm = fileData[0]["Term"].toString()
        const [term, year] = regex.splitFullTerm(fileTerm)
        const fileDecisions: Decision[] = []

        fileData.forEach((decision) => {
            // Verify all needed fields exist in decision
            const requiredFields = [
                "Store",
                "EAN-13",
                "Title",
                "Decision"
            ]

            for (const field of requiredFields) {
                if (decision[field] === undefined) {
                    throw new Error(`Missing value for required field: ${field}\n${JSON.stringify(decision)}`)
                }
            }

            const store = Number(decision.Store)
            const isbn = decision["EAN-13"].toString()
            const title = decision["Title"].toString()
            const fileDec = Number(decision["Decision"])

            if (store !== 620) return

            // Aggregate decisions if multiple books are listed in sheet
            const existingBook = fileBooks.find(book => book[0] === isbn)
            if (!existingBook) {
                const newBook = [
                    isbn,
                    title,
                    fileDec
                ]
                fileBooks.push(newBook)
            } else {
                if (typeof existingBook[2] === 'number') {
                    existingBook[2] += fileDec
                }
            }
        })

        if (fileBooks.length > 0) {
            const termData = await sqlDB.sales.getPrevSalesByBookArr(term, year, fileBooks)

            termData.forEach((book: SQLDecision) => {
                const newDecision = calculateDecision(book)
                fileDecisions.push(newDecision)
            })

            return { decisions: fileDecisions, term: fileTerm }
        } else {
            throw "No buying decisions found for store."
        }
    } catch (error) {
        throw error
    }
}

const calculateDecision = (book: SQLDecision) => {
    // Get previous semester sales over enrollment
    const salesEnrl = book.TotalSales && (book.PrevActEnrl !== 0) ? book.TotalSales / book.PrevActEnrl : 0.2

    // If no current Actual Enrollment, calculate based on past percent change from Estimated to Actual
    if (book.CurrActEnrl === 0 && book.CurrEstEnrl !== 0) {
        // Calculate previous percentage change as a multiplier
        const prevPerChange = book.PrevEstEnrl ? (book.PrevActEnrl - book.PrevEstEnrl) / book.PrevEstEnrl : 0

        // Apply the percentage change to current estimated enrollment
        book.CurrActEnrl = Math.round(book.CurrEstEnrl * (1 + prevPerChange))
    }

    const newDec = Math.round(book.CurrActEnrl * salesEnrl)
    const newDecision: Decision = {
        ISBN: book.ISBN,
        Title: book.Title,
        ActEnrl: book.CurrActEnrl,
        EstSales: book.Decision ?? book.CurrEstSales,
        Decision: newDec,
        Diff: Math.abs((book.Decision ?? book.CurrEstSales) - newDec)
    }

    return newDecision
}

export { getTermDecisions, getFileDecisions }