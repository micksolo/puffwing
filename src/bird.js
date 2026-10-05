import * as THREE from 'three'
import { diveTilt } from './physics.js'

const sphereGeo = new THREE.SphereGeometry(1, 20, 14)
const coneGeo = new THREE.ConeGeometry(0.32, 0.7, 10)

export function createBird(opts = {}) {
  const ghost = !!opts.ghost
  const mk = (c) => {
    const col = ghost ? '#cfe0f5' : c
    const m = new THREE.MeshLambertMaterial({ color: col })
    if (ghost) {
      m.transparent = true
      m.opacity = 0.35
      m.depthWrite = false
    }
    return m
  }
  const group = new THREE.Group()

  const bodyMat = mk('#8fd0ff')
  const body = new THREE.Mesh(sphereGeo, bodyMat)
  body.scale.set(1.2, 1.05, 1)
  group.add(body)

  const belly = new THREE.Mesh(sphereGeo, mk('#fff3d8'))
  belly.scale.set(0.85, 0.7, 0.72)
  belly.position.set(0.38, -0.32, 0)
  group.add(belly)

  const wingGeo = sphereGeo
  const leftW = new THREE.Group()
  leftW.position.set(0, 0.25, 0.4)
  const lw = new THREE.Mesh(wingGeo, mk('#6db8f2'))
  lw.scale.set(0.95, 0.28, 1.35)
  lw.position.set(0, 0, 0.75)
  leftW.add(lw)
  group.add(leftW)

  const rightW = new THREE.Group()
  rightW.position.set(0, 0.25, -0.4)
  const rw = new THREE.Mesh(wingGeo, mk('#6db8f2'))
  rw.scale.set(0.95, 0.28, 1.35)
  rw.position.set(0, 0, -0.75)
  rightW.add(rw)
  group.add(rightW)

  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(sphereGeo, mk('#ffffff'))
    eye.scale.setScalar(0.24)
    eye.position.set(0.68, 0.36, side * 0.45)
    group.add(eye)
    const pupil = new THREE.Mesh(sphereGeo, mk('#2b2b3d'))
    pupil.scale.setScalar(0.11)
    pupil.position.set(0.85, 0.36, side * 0.5)
    group.add(pupil)
    const spark = new THREE.Mesh(
      sphereGeo,
      ghost ? mk('#ffffff') : new THREE.MeshBasicMaterial({ color: '#ffffff' })
    )
    spark.scale.setScalar(0.045)
    spark.position.set(0.9, 0.45, side * 0.53)
    group.add(spark)
    const cheek = new THREE.Mesh(sphereGeo, mk('#ffb3c1'))
    cheek.scale.setScalar(0.15)
    cheek.position.set(0.55, -0.02, side * 0.58)
    group.add(cheek)
    const tail = new THREE.Mesh(sphereGeo, mk('#6db8f2'))
    tail.scale.set(0.5, 0.22, 0.3)
    tail.position.set(-1.15, 0.15, side * 0.22)
    group.add(tail)
  }

  const beak = new THREE.Mesh(coneGeo, mk('#ffab4d'))
  beak.rotation.z = -Math.PI / 2
  beak.position.set(1.2, 0.02, 0)
  group.add(beak)

  const crest1 = new THREE.Mesh(sphereGeo, mk('#6db8f2'))
  crest1.scale.set(0.16, 0.5, 0.14)
  crest1.position.set(0.15, 1.05, 0)
  crest1.rotation.z = 0.35
  group.add(crest1)
  const crest2 = crest1.clone()
  crest2.position.set(0.45, 0.98, 0)
  crest2.rotation.z = 0.7
  group.add(crest2)

  group.frustumCulled = false
  return { group, leftW, rightW, bodyMat }
}

export function animateBird(b, { t, vx, vy, grounded, hold }) {
  b.group.rotation.z = diveTilt(vx, vy, !!hold, !!grounded)
  const diving = !!hold
  b.group.scale.set(diving ? 1.14 : 1, diving ? 0.78 : 1, 1)
  if (b.bodyMat && !b.bodyMat.transparent) {
    b.bodyMat.color.set(diving ? '#ff9a3c' : '#8fd0ff')
    b.bodyMat.emissive.set(diving ? '#d4651a' : '#000000')
  }
  const flapSpeed = grounded ? 3 : 13
  const amp = diving ? 0.08 : grounded ? 0.22 : 0.85
  const f = diving ? -0.35 : Math.sin(t * flapSpeed) * amp
  b.leftW.rotation.x = f
  b.rightW.rotation.x = -f
}
