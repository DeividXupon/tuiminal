import { HTTP_DOCS_MESSAGES } from "./http-docs-catalog"
import { HTTP_VARIABLE_MESSAGES } from "./http-variable-catalog"

export const HTTP_EDITOR_MESSAGES = [...HTTP_DOCS_MESSAGES, ...HTTP_VARIABLE_MESSAGES] as const
