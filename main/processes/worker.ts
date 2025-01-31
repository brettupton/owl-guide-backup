const { Worker } = require('worker_threads')

export const newWorker = (workerPath: string, workerID: string, workerData: JSObj): Promise<void> => {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, { workerData })

        worker.on('message', (message: string) => {
            console.log(`${workerID}: ${message}`)
        })

        worker.on('error', (error: Error) => {
            reject(`${workerID} Unexpected ${error}`)
        })

        worker.on('exit', (code: number) => {
            if (code !== 0) {
                reject(`${workerID} exited with code ${code}.`)
            }
            resolve()
        })
    })
}