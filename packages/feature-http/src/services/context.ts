import { resolve } from "node:path"

export const HTTP_WORKING_DIRECTORY = resolve(process.env.TUIMINAL_WORKDIR ?? process.cwd())
