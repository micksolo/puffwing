import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { World } from '../src/world.js'

test('the playable hill is a colored surface whose shade follows the slope', () => {
  const world = new World(new THREE.Scene(), 20261005)
  world.update(1 / 60, 80, 6, 1, {})
  const r = world.mainR
  assert.equal(r.mesh.material.type, 'MeshBasicMaterial')
  assert.equal(r.mesh.material.vertexColors, true)
  assert.equal(r.rows, 3)

  let maxCh = 0
  const crestG = []
  for (let i = 0; i < r.N; i++) {
    const k = i * r.rows * 3
    maxCh = Math.max(maxCh, r.col[k], r.col[k + 1], r.col[k + 2])
    crestG.push(r.col[k + 1])
    assert.ok(r.col[k + 1] > 0.15, 'crest green is missing at column ' + i)
  }
  assert.ok(maxCh > 0.45, 'hill should read as a light surface, max channel ' + maxCh.toFixed(3))
  const spread = Math.max(...crestG) - Math.min(...crestG)
  assert.ok(spread > 0.08, 'slope shading should change along the hill, spread ' + spread.toFixed(3))

  const flat = world.bgR1
  assert.equal(flat.mesh.material.vertexColors, true)
  const farG = []
  for (let i = 0; i < flat.N; i++) farG.push(flat.col[i * flat.rows * 3 + 1])
  const farSpread = Math.max(...farG) - Math.min(...farG)
  assert.ok(farSpread > 0.05, 'distant hills should show slope, spread ' + farSpread.toFixed(3))
  assert.ok(Math.max(...farG) > 0.35)
})
