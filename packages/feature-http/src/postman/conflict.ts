/** A preflight conflict: no remote mutation has been attempted. */
export class PostmanCollectionConflict extends Error {
  constructor() {
    super("A coleção mudou no Postman; importe-a novamente antes de editar a pasta.")
    this.name = "PostmanCollectionConflict"
  }
}
