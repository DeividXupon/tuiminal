import { expect, test } from "bun:test"
import { MouseTrail } from "../apps/cli/src/ui/mouse-trail"

test("movement leaves a compact ASCII wake that fades completely without further input", () => {
  const trail = new MouseTrail()
  trail.move(5, 5, 0)
  expect(trail.frame(0)).toEqual([])
  trail.move(11, 5, 30)
  const fresh = trail.frame(30)
  expect(fresh.length).toBe(5)
  expect(fresh[0]?.strength).toBeGreaterThan(0.7)
  expect(fresh.some((cell) => cell.glyph === "+")).toBe(true)
  expect(fresh.every((cell) => cell.x < 11 && cell.y === 5)).toBe(true)
  const faded = trail.frame(450)
  expect(faded.every((cell) => cell.glyph === ".")).toBe(true)
  expect(faded[0]?.strength).toBeLessThan(fresh[0]?.strength ?? 0)
  expect(trail.frame(680)).toEqual([])
  expect(trail.active).toBe(false)
})

test("repeated coordinates, fast input, idle returns and large jumps do not create bursts", () => {
  const trail = new MouseTrail()
  trail.move(0, 0, 0)
  for (let time = 1; time < 100; time++) trail.move(0, 0, time)
  expect(trail.frame(100)).toEqual([])
  trail.move(2, 0, 101)
  trail.move(3, 0, 102)
  expect(trail.frame(102)).toHaveLength(2)
  trail.move(70, 0, 140)
  expect(trail.frame(140)).toHaveLength(2)
  trail.move(71, 0, 800)
  expect(trail.frame(800)).toEqual([])
})

test("sustained movement stays bounded and never paints the current pointer cell", () => {
  const trail = new MouseTrail()
  for (let step = 0; step < 100; step++) {
    trail.move(step * 6, 4, step * 30)
    const frame = trail.frame(step * 30)
    expect(frame.length).toBeLessThanOrEqual(24)
    expect(frame.every((cell) => cell.x !== step * 6 || cell.y !== 4)).toBe(true)
    expect(frame.every((cell) => /^[+:.]$/.test(cell.glyph))).toBe(true)
  }
  expect(trail.frame(2970).length).toBeGreaterThan(12)
  trail.clear()
  expect(trail.active).toBe(false)
  trail.move(4, 2, 4000)
  expect(trail.frame(4000)).toEqual([])
})
