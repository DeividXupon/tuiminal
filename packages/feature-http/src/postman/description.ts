import { postmanRequestDescription } from "../importing/postman-description"

export function confirmPostmanDescription(
  update: Record<string, unknown>,
  item: Record<string, unknown>,
) {
  if (
    typeof update.description === "string" &&
    postmanRequestDescription(item) !== update.description
  ) {
    throw new Error(
      "O Postman não confirmou a documentação enviada. A atualização permanece pendente.",
    )
  }
}
