const LIFETIME_MS = 650
const MAX_PARTICLES = 24
const EMISSION_INTERVAL_MS = 20

type Point = { x: number; y: number; time: number }
type Particle = Point & { drift: number; bright: boolean }
export type TrailCell = { x: number; y: number; glyph: string; strength: number }

/** A short, bounded wake in terminal cells; no timers or rendering dependencies. */
export class MouseTrail {
  private particles: Particle[] = []
  private previous: Point | null = null
  private emittedAt = -Infinity
  private sequence = 0

  clear() {
    this.particles = []
    this.previous = null
    this.emittedAt = -Infinity
  }

  move(x: number, y: number, time: number) {
    const previous = this.previous
    if (previous?.x === x && previous.y === y) return
    this.previous = { x, y, time }
    if (!previous) return
    const distance = Math.hypot(x - previous.x, (y - previous.y) * 2)
    // Returning to the window or jumping across it must not paint a long streak.
    if (time - previous.time > 160 || distance > 18) return
    if (time - this.emittedAt < EMISSION_INTERVAL_MS) return
    this.emittedAt = time
    this.particles = this.particles.filter((particle) => time - particle.time < LIFETIME_MS)
    const count = Math.min(5, Math.max(1, Math.ceil(distance)))
    for (let index = 0; index < count; index++) {
      const fraction = index / count
      this.sequence++
      this.particles.push({
        x: previous.x + (x - previous.x) * fraction,
        y: previous.y + (y - previous.y) * fraction,
        time,
        drift: this.sequence % 2 ? -1 : 1,
        bright: this.sequence % 3 === 0,
      })
    }
    this.particles = this.particles.slice(-MAX_PARTICLES)
  }

  frame(time: number): TrailCell[] {
    this.particles = this.particles.filter((particle) => time - particle.time < LIFETIME_MS)
    const cells = new Map<string, TrailCell>()
    for (const particle of this.particles) {
      const age = Math.max(0, (time - particle.time) / LIFETIME_MS)
      const x = Math.round(particle.x + particle.drift * age * 0.65)
      const y = Math.round(particle.y + age * age * 0.35)
      if (x === this.previous?.x && y === this.previous.y) continue
      cells.set(`${x},${y}`, {
        x,
        y,
        glyph: age < 0.22 && particle.bright ? "+" : age < 0.55 ? ":" : ".",
        strength: 0.78 * (1 - age) ** 1.3,
      })
    }
    return [...cells.values()]
  }

  get active() {
    return this.particles.length > 0
  }
}
