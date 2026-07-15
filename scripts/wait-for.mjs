// Blocks until runs/<id>/run.json reaches one of the given statuses, then prints it.
// Usage: node scripts/wait-for.mjs <run-id> <status[,status...]>
import {readFileSync, watch} from 'node:fs'
import {join} from 'node:path'

const [id, statusArg] = process.argv.slice(2)
if (id === undefined || statusArg === undefined) {
    console.error('Usage: node scripts/wait-for.mjs <run-id> <status[,status...]>')
    process.exit(2)
}
const wanted = statusArg.split(',')
const runDir = join(process.cwd(), 'runs', id)

const check = () => {
    try {
        const {status} = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'))
        if (wanted.includes(status)) {
            console.log(status)
            process.exit(0)
        }
    } catch {
        // torn read mid-rename or missing file; the next event/poll retries
    }
}

check()
// watch the dir, not the file: the store replaces run.json atomically via rename
watch(runDir, check)
// ponytail: poll fallback because fs.watch on macOS can miss renames
setInterval(check, 2000)
