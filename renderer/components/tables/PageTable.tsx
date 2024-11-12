import { MutableRefObject } from "react"

interface PageTableProps {
    pageData: { [field: string]: string | number }[]
    totalRows: number
    page: number
    limit: number
    updatePage: (newPage: number) => void
    tableRef: MutableRefObject<HTMLTableElement>
    handleRowClick?: (courseID: number) => void
    activeRow?: number
}

export default function PageTable({ pageData, totalRows, page, limit, updatePage, tableRef, handleRowClick, activeRow }: PageTableProps) {
    const headers = Object.keys(pageData[0])

    const rowClass = (header: string) => {
        // Certain headers need to be centered and set fixed width for professor column
        const centerHeaders = ['Course', 'Section', 'EstEnrl', 'ActEnrl', 'NoText', 'Adoptions']

        return `p-2 ${header === 'Prof' ? 'w-52' : centerHeaders.includes(header) ? 'text-center' : ''}`
    }

    return (
        <div className="w-full">
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg max-h-[calc(100vh-9rem)]">
                <table className="w-full text-sm text-left rtl:text-right text-white" ref={tableRef}>
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700 sticky top-0">
                        <tr>
                            {headers.map((header, index) => {
                                return (
                                    <th scope="col" className={rowClass(header)} key={index}>
                                        {header}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {pageData.map((row) => {
                            return (
                                <tr className="bg-gray-800 border-b border-gray-700 hover:bg-gray-600" key={row['ID']} onClick={() => handleRowClick(row['ID'] as number)}>
                                    {headers.map((header, index) => {
                                        return (
                                            <td className={rowClass(header) + ` ${activeRow === row['ID'] ? 'bg-gray-400' : ''}`} key={`${row['ID']}-${header}`}>
                                                {row[header]}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <nav className="flex items-center flex-column flex-wrap md:flex-row justify-between pt-2" aria-label="Table navigation">
                <span className="text-sm font-normal text-gray-400 mb-2 md:mb-0 block w-full md:inline md:w-auto">
                    Showing
                    <span className="font-semibold text-white px-1">
                        {((page - 1) * limit) + 1}-{pageData.length * page}
                    </span>
                    of
                    <span className="font-semibold text-white px-1">
                        {totalRows}
                    </span>
                </span>
                <div className="flex">
                    <button
                        onClick={() => updatePage(page - 1)}
                        className="flex items-center justify-center px-3 h-8 me-3 text-sm font-medium border rounded-lg  bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                        <svg className="w-3.5 h-3.5 me-2 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5H1m0 0 4 4M1 5l4-4" />
                        </svg>
                        Previous
                    </button>
                    <button
                        onClick={() => updatePage(page + 1)}
                        className="flex items-center justify-center px-3 h-8 me-3 text-sm font-medium border rounded-lg  bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                        Next
                        <svg className="w-3.5 h-3.5 ms-2 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1 5h12m0 0L9 1m4 4L9 9" />
                        </svg>
                    </button>
                </div>
            </nav>
        </div>
    )
}