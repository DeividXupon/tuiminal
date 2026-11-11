import { useEffect, useState } from "react"
import type { HttpRequestDefinition } from "../model/types"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import {
  hasPostmanDocumentationSource,
  readPostmanRequestDocumentation,
} from "../postman/documentation"
import { HTTP_WORKING_DIRECTORY } from "../services/context"

type Documentation = { key: string; text: string; error: string | null }

function documentationIdentity(request: HttpRequestDefinition) {
  return JSON.stringify([
    request.id,
    request.source.kind === "file" ? request.source.sourceHash : "",
  ])
}

function documentationError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useHttpRequestDocumentation(request: HttpRequestDefinition, visible: boolean) {
  const [loaded, setLoaded] = useState<Documentation | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${documentationIdentity(request)}:${attempt}`
  const needsRemote = request.description === undefined && hasPostmanDocumentationSource(request)
  const ready = loaded?.key === key
  useEffect(() => {
    if (!visible || !needsRemote || ready) return
    let disposed = false
    const load = async () => {
      try {
        const account = await loadPostmanAccount()
        if (disposed) return
        if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
        const text = await readPostmanRequestDocumentation(
          HTTP_WORKING_DIRECTORY,
          new PostmanApi(account),
          request,
        )
        if (!disposed) setLoaded({ key, text, error: null })
      } catch (error) {
        if (!disposed)
          setLoaded({
            key,
            text: "",
            error: documentationError(error),
          })
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [key, needsRemote, ready, request, visible])
  return {
    text: request.description ?? (ready ? loaded.text : ""),
    loading: needsRemote && !ready,
    error: needsRemote && ready ? loaded.error : null,
    retry: () => setAttempt((value) => value + 1),
  }
}
