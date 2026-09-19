import { useEffect, useRef, useState } from "react"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi, type PostmanWorkspace } from "../postman/api"

export function usePostmanCollectionDestination() {
  const [destination, setDestination] = useState<"tuiminal" | "postman">("tuiminal")
  const [workspaces, setWorkspaces] = useState<PostmanWorkspace[]>([])
  const [workspaceIndex, setWorkspaceIndex] = useState(0)
  const [workspaceError, setWorkspaceError] = useState("")
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const reset = (value: "tuiminal" | "postman" = "tuiminal") => {
    generation.current += 1
    setDestination(value)
    setWorkspaces([])
    setWorkspaceIndex(0)
    setWorkspaceError("")
    if (value === "postman") choose("postman", true)
  }

  const choose = (value: "tuiminal" | "postman", reload = false) => {
    setDestination(value)
    if (value !== "postman" || (!reload && (workspaces.length || workspaceError))) return
    const current = ++generation.current
    void loadPostmanAccount()
      .then(async (account) => {
        if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
        const next = await new PostmanApi(account).workspaces()
        if (current === generation.current) setWorkspaces(next)
      })
      .catch((error) => {
        if (current === generation.current)
          setWorkspaceError(error instanceof Error ? error.message : String(error))
      })
  }

  return {
    destination,
    choose,
    workspaces,
    workspaceIndex,
    setWorkspaceIndex,
    workspaceError,
    setWorkspaceError,
    reset,
  }
}
