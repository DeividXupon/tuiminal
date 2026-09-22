// Cold-start children must never read or write the developer's credential store.
Object.assign(Bun, {
  secrets: {
    async get() {
      return null
    },
    async set() {
      throw new Error("Benchmark credential writes are disabled")
    },
    async delete() {
      return false
    },
  },
})
