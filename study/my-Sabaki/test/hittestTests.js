import assert from 'assert'

import {pickSegmentAt} from '../src/modules/hittest.js'

// A click lands on a vertex, but several lines may radiate from it. The pointer's
// position inside the cell disambiguates: we pick the segment that points the
// same way as the click, and refuse when the click carries no usable direction.
const vertex = [5, 5]
const right = {v1: [5, 5], v2: [8, 5], type: 'line'}
const down = {v1: [5, 5], v2: [5, 8], type: 'line'}
const diagonal = {v1: [5, 5], v2: [8, 8], type: 'line'}

describe('pickSegmentAt', () => {
  it('finds nothing when the vertex has no marks', () => {
    assert.strictEqual(pickSegmentAt([], vertex, {dx: 0.4, dy: 0}), -1)
  })

  it('returns the only candidate without needing a direction', () => {
    assert.strictEqual(pickSegmentAt([right], vertex, null), 0)
    assert.strictEqual(pickSegmentAt([right], vertex, {dx: 0, dy: 0}), 0)
  })

  it('picks the segment the click points along', () => {
    assert.strictEqual(
      pickSegmentAt([right, down], vertex, {dx: 0.4, dy: 0}),
      0,
    )
    assert.strictEqual(
      pickSegmentAt([right, down], vertex, {dx: 0, dy: 0.4}),
      1,
    )
  })

  it('picks the opposite direction correctly', () => {
    // `left` points away from +x, so clicking up-left must select it.
    let left = {v1: [5, 5], v2: [2, 5]}
    assert.strictEqual(
      pickSegmentAt([right, left], vertex, {dx: -0.4, dy: 0}),
      1,
    )
  })

  it('handles segments stored with the clicked vertex as v2', () => {
    let fromFarEnd = {v1: [8, 5], v2: [5, 5]}
    assert.strictEqual(
      pickSegmentAt([down, fromFarEnd], vertex, {dx: 0.4, dy: 0}),
      1,
    )
  })

  it('matches diagonals', () => {
    assert.strictEqual(
      pickSegmentAt([right, diagonal], vertex, {dx: 0.3, dy: 0.3}),
      1,
    )
  })

  it('refuses a click too close to the cell centre to read as a direction', () => {
    assert.strictEqual(
      pickSegmentAt([right, down], vertex, {dx: 0.02, dy: 0.01}),
      -1,
    )
    assert.strictEqual(pickSegmentAt([right, down], vertex, null), -1)
  })

  it('refuses when the click is perpendicular to every candidate', () => {
    // up-left is ~135deg away from both +x and +y
    assert.strictEqual(
      pickSegmentAt([right, down], vertex, {dx: -0.3, dy: -0.3}),
      -1,
    )
  })

  it('is stable when two candidates share a direction', () => {
    // Same direction, different lengths: the first listed wins.
    let longer = {v1: [5, 5], v2: [12, 5]}
    assert.strictEqual(
      pickSegmentAt([right, longer], vertex, {dx: 0.4, dy: 0}),
      0,
    )
  })
})
