import * as THREE from 'three'
import { Terrain } from './terrain.js'

const sphereGeo = new THREE.SphereGeometry(1, 18, 12)
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.5, 8)
const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6)
const millGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 10)
const millRoofGeo = new THREE.ConeGeometry(0.65, 0.9, 10)
const rockGeo = new THREE.DodecahedronGeometry(0.7)
const houseGeo = new THREE.BoxGeometry(1.7, 1.3, 1.5)
const houseRoofGeo = new THREE.ConeGeometry(1.5, 1, 4)
const doorGeo = new THREE.BoxGeometry(0.42, 0.62, 0.1)
const bladeGeo = new THREE.PlaneGeometry(0.34, 1.5)
const petalGeo = new THREE.SphereGeometry(0.2, 8, 6)
const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 20)

const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o })
const MAT = {
  trunk: L('#9c6b4f'),
  leaf1: L('#5fce8f'),
  leaf2: L('#8fe8b2'),
  leaf3: L('#b6f4c9'),
  stem: L('#6cc98a'),
  petalPink: L('#ff9fc0'),
  petalWhite: L('#fff5fa'),
  petalYellow: L('#ffe08a'),
  center: L('#ffd93d'),
  rock: L('#b9c0c9'),
  mill: L('#f2e6d8'),
  roof: L('#ff8fb3'),
  wall: L('#ffe3ea'),
  door: L('#b9825a'),
  blade: L('#fffdf8', { side: THREE.DoubleSide }),
  coin: L('#ffd93d', { emissive: '#8a6a10' })
}

const K_DAY_TOP = new THREE.Color('#6fc3ff')
const K_DAY_BOT = new THREE.Color('#dff4ff')
const K_SET_TOP = new THREE.Color('#7a86c8')
const K_SET_BOT = new THREE.Color('#ffcf9e')
const K_NIGHT_TOP = new THREE.Color('#1c2a52')
const K_NIGHT_BOT = new THREE.Color('#3a4a73')
const GRASS_LO = new THREE.Color('#4fae7e')
const GRASS_HI = new THREE.Color('#a4eec2')
const DIRT_LO = new THREE.Color('#5e4a3a')
const DIRT_HI = new THREE.Color('#8a6f57')
const WATER_LO = new THREE.Color('#a8e6f2')
const WATER_HI = new THREE.Color('#57b4dd')
const CREST_WHITE = new THREE.Color('#f6fff4')
const FAR_LO = new THREE.Color('#7fbfa4')
const FAR_HI = new THREE.Color('#d7f3e4')
const FARTHER_LO = new THREE.Color('#8eb4d4')
const FARTHER_HI = new THREE.Color('#e7f4fb')

function buildTree() {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(trunkGeo, MAT.trunk)
  trunk.position.y = 0.75
  g.add(trunk)
  const f1 = new THREE.Mesh(sphereGeo, MAT.leaf1)
  f1.scale.setScalar(1.5)
  f1.position.y = 2.2
  const f2 = new THREE.Mesh(sphereGeo, MAT.leaf2)
  f2.scale.setScalar(1.05)
  f2.position.set(0.4, 3.0, 0.2)
  const f3 = new THREE.Mesh(sphereGeo, MAT.leaf3)
  f3.scale.setScalar(0.72)
  f3.position.set(-0.45, 3.5, -0.25)
  g.add(f1, f2, f3)
  return g
}

function buildFlower(white) {
  const g = new THREE.Group()
  const stem = new THREE.Mesh(stemGeo, MAT.stem)
  stem.position.y = 0.5
  g.add(stem)
  const pm = white ? MAT.petalWhite : MAT.petalPink
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(petalGeo, pm)
    const a = (i / 6) * Math.PI * 2
    p.position.set(Math.cos(a) * 0.3, 1.02, Math.sin(a) * 0.3)
    g.add(p)
  }
  const c = new THREE.Mesh(sphereGeo, MAT.center)
  c.scale.setScalar(0.24)
  c.position.y = 1.02
  g.add(c)
  return g
}

function buildRock() {
  const g = new THREE.Group()
  const r = new THREE.Mesh(rockGeo, MAT.rock)
  r.position.y = 0.35
  r.scale.y = 0.72
  r.rotation.y = Math.random() * Math.PI
  g.add(r)
  return g
}

function buildWindmill() {
  const g = new THREE.Group()
  const tower = new THREE.Mesh(millGeo, MAT.mill)
  tower.position.y = 1.6
  const roof = new THREE.Mesh(millRoofGeo, MAT.roof)
  roof.position.y = 3.6
  const hub = new THREE.Mesh(sphereGeo, MAT.trunk)
  hub.scale.setScalar(0.2)
  hub.position.set(0, 2.9, 0.42)
  const blades = new THREE.Group()
  blades.position.set(0, 2.9, 0.5)
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group()
    arm.rotation.z = (i / 4) * Math.PI * 2
    const b = new THREE.Mesh(bladeGeo, MAT.blade)
    b.position.y = 0.85
    arm.add(b)
    blades.add(arm)
  }
  g.add(tower, roof, hub, blades)
  g.userData.blades = blades
  return g
}

function buildHouse() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(houseGeo, MAT.wall)
  body.position.y = 0.65
  const roof = new THREE.Mesh(houseRoofGeo, MAT.roof)
  roof.position.y = 1.75
  roof.rotation.y = Math.PI / 4
  const door = new THREE.Mesh(doorGeo, MAT.door)
  door.position.set(0, 0.32, 0.78)
  g.add(body, roof, door)
  return g
}

const BUILDERS = {
  tree: buildTree,
  flower: buildFlower,
  rock: buildRock,
  windmill: buildWindmill,
  house: buildHouse
}

function buildCoin() {
  const g = new THREE.Group()
  const m = new THREE.Mesh(coinGeo, MAT.coin)
  m.rotation.x = Math.PI / 2
  g.add(m)
  return g
}

export class World {
  constructor(scene, seed) {
    this.scene = scene
    this.tTotal = 0
    this.cTop = new THREE.Color()
    this.cBot = new THREE.Color()
    this.cTmp = new THREE.Color()

    this.buildSky()
    this.buildCelestials()
    this.buildClouds()
    this.buildParticles()
    this.buildShadow()

    this.decor = new Map()
    this.pools = { tree: [], flower: [], rock: [], windmill: [], house: [] }
    this.coinMap = new Map()
    this.coinPool = []

    this.setTerrain(seed)

    this.mainR = this.makeRibbon(200, 2, 0, (x) => this.terrain.height(x), 'play')
    this.bgR1 = this.makeRibbon(80, 5, -55, (x) => this.bg1.height(x * 0.6) * 2.2 + 10, 'far')
    this.bgR2 = this.makeRibbon(100, 6, -125, (x) => this.bg2.height(x * 0.3) * 3 + 22, 'farther')
  }

  setTerrain(seed) {
    this.terrain = new Terrain(seed)
    this.bg1 = new Terrain((seed ^ 0x9e3779b9) >>> 0)
    this.bg2 = new Terrain((seed ^ 0x85ebca6b) >>> 0)
    if (this.mainR) {
      this.mainR.hFn = (x) => this.terrain.height(x)
      this.bgR1.hFn = (x) => this.bg1.height(x * 0.6) * 2.2 + 10
      this.bgR2.hFn = (x) => this.bg2.height(x * 0.3) * 3 + 22
    }
    for (const rec of this.decor.values()) {
      rec.g.visible = false
      this.pools[rec.type].push(rec.g)
    }
    this.decor.clear()
    for (const g of this.coinMap.values()) {
      g.visible = false
      this.coinPool.push(g)
    }
    this.coinMap.clear()
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color('#6fc3ff') },
        bottom: { value: new THREE.Color('#dff4ff') }
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(bottom, top, pow(vUv.y, 0.7)), 1.0); }',
      depthWrite: false
    })
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1100), this.skyMat)
    this.sky.position.z = -150
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
    this.scene.fog = new THREE.Fog(0xdff4ff, 260, 720)
  }

  buildCelestials() {
    this.sunG = new THREE.Group()
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(7, 32),
      new THREE.MeshBasicMaterial({ color: '#ffe08a', fog: false })
    )
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(11, 32),
      new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.25, fog: false })
    )
    glow.position.z = -0.6
    this.sunG.add(sun, glow)
    this.sunG.frustumCulled = false
    this.scene.add(this.sunG)

    this.moonG = new THREE.Group()
    this.moonMat = new THREE.MeshBasicMaterial({ color: '#f2f6ff', transparent: true, opacity: 0, fog: false })
    const moon = new THREE.Mesh(new THREE.CircleGeometry(5, 32), this.moonMat)
    this.craterMat = new THREE.MeshBasicMaterial({ color: '#ccd6f2', transparent: true, opacity: 0, fog: false })
    const c1 = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), this.craterMat)
    c1.position.set(1.2, 1.1, 0.02)
    const c2 = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), this.craterMat)
    c2.position.set(-1.4, -0.7, 0.02)
    this.moonG.add(moon, c1, c2)
    this.moonG.frustumCulled = false
    this.scene.add(this.moonG)

    const starPos = new Float32Array(160 * 3)
    for (let i = 0; i < 160; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 420
      starPos[i * 3 + 1] = 15 + Math.random() * 110
      starPos[i * 3 + 2] = -135
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    })
    this.stars = new THREE.Points(starGeo, this.starMat)
    this.stars.frustumCulled = false
    this.scene.add(this.stars)
  }

  buildClouds() {
    this.clouds = []
    const cloudMat = L('#ffffff', { transparent: true, opacity: 0.92 })
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group()
      const n = 3 + Math.floor(Math.random() * 3)
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(sphereGeo, cloudMat)
        const r = 2 + Math.random() * 2.5
        s.scale.set(r, r * 0.6, r)
        s.position.set((j - (n - 1) / 2) * r * 1.15, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 2)
        g.add(s)
      }
      g.position.set(Math.random() * 320, 24 + Math.random() * 26, -(45 + Math.random() * 60))
      this.clouds.push({ g, vx: 0.8 + Math.random() * 1.2 })
      this.scene.add(g)
    }
  }

  buildParticles() {
    this.pCount = 260
    this.p = []
    for (let i = 0; i < this.pCount; i++) {
      this.p.push({ life: 0, ttl: 1, x: 0, y: 0, vx: 0, vy: 0, grav: true, r: 1, g: 1, b: 1 })
    }
    this.pGeo = new THREE.BufferGeometry()
    this.pPos = new Float32Array(this.pCount * 3)
    this.pCol = new Float32Array(this.pCount * 3)
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3))
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3))
    this.pMat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    })
    this.pMesh = new THREE.Points(this.pGeo, this.pMat)
    this.pMesh.frustumCulled = false
    this.scene.add(this.pMesh)
  }

  buildShadow() {
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#1e3b2a', transparent: true, opacity: 0.2, depthWrite: false })
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.visible = false
    this.scene.add(this.shadow)
  }

  makeRibbon(N, step, z, hFn, mode) {
    // Three rows on the playable hill: a lit crest, a slope-shaded face,
    // and the dirt underneath. Distant hills are a two-row card with the
    // same slope paint, just paler.
    const rows = mode === 'play' ? 3 : 2
    const pos = new Float32Array(N * rows * 3)
    const col = new Float32Array(N * rows * 3)
    const idx = []
    for (let i = 0; i < N - 1; i++) {
      for (let row = 0; row < rows - 1; row++) {
        const a = i * rows + row
        const b = a + rows
        idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    // MeshLambert with no normals is black on the static three.js build:
    // the shader's normal attribute stays (0,0,0) and the light term is zero.
    // Basic + painted colors is what actually shows up, and it carries the slope.
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    return { mesh, pos, col, N, rows, step, z, hFn, mode, off: -(N * step) * 0.4 }
  }

  updateRibbon(r, camX, dayT) {
    const x0 = camX + r.off
    const dayLight = 0.4 + 0.6 * Math.max(0, Math.min(1, (dayT - 0.08) / 0.7))
    const rows = r.rows
    for (let i = 0; i < r.N; i++) {
      const x = x0 + i * r.step
      const h = r.hFn(x)
      const base = i * rows * 3
      const shoulder = rows === 3 ? h - 2.6 : -240
      r.pos[base] = x
      r.pos[base + 1] = h + (rows === 3 ? 0.15 : 0)
      r.pos[base + 2] = r.z + (rows === 3 ? 1.15 : 0)
      r.pos[base + 3] = x
      r.pos[base + 4] = shoulder
      r.pos[base + 5] = r.z + (rows === 3 ? 0.25 : 0)
      if (rows === 3) {
        r.pos[base + 6] = x
        r.pos[base + 7] = -240
        r.pos[base + 8] = r.z
      }
      if (r.col) {
        const h2 = r.hFn(x + r.step)
        const slope = (h2 - h) / r.step
        const steep = Math.min(1, Math.abs(slope) * 0.8)
        const downhill = slope < 0
        const sun = (downhill ? 1.12 + 0.34 * steep : 0.62 - 0.22 * steep) * dayLight
        const warm = downhill ? 0.07 * steep : 0
        const cool = downhill ? 0 : 0.06 * steep
        const paint = (dst, src, mul, extraR, extraB) => {
          r.col[dst] = Math.min(1, src.r * mul + extraR)
          r.col[dst + 1] = Math.min(1, src.g * mul)
          r.col[dst + 2] = Math.min(1, src.b * mul + extraB)
        }
        if (r.mode === 'play') {
          let top, dirt
          if (h < -12) {
            const wd = Math.max(0, Math.min(1, (-12 - h) / 16))
            top = this.cTmp.copy(WATER_LO).lerp(WATER_HI, wd)
            dirt = this.cTop.copy(DIRT_LO).lerp(DIRT_HI, 0.25)
          } else {
            const t = Math.max(0, Math.min(1, (h + 16) / 34))
            top = this.cTmp.copy(GRASS_LO).lerp(GRASS_HI, 0.35 + 0.65 * t)
            dirt = this.cTop.copy(DIRT_LO).lerp(DIRT_HI, t)
          }
          const crest = this.cBot.copy(top).lerp(CREST_WHITE, downhill ? 0.42 : 0.12)
          paint(base, crest, sun, warm, cool * 0.4)
          paint(base + 3, top, sun * 0.92, warm * 0.6, cool)
          paint(base + 6, dirt, (0.78 + 0.22 * (downhill ? 1 : 0.7)) * dayLight, 0, cool * 0.5)
        } else {
          const lo = r.mode === 'far' ? FAR_LO : FARTHER_LO
          const hi = r.mode === 'far' ? FAR_HI : FARTHER_HI
          const t = Math.max(0, Math.min(1, (h + 8) / 40))
          const face = this.cTmp.copy(lo).lerp(hi, t)
          const crest = this.cBot.copy(face).lerp(CREST_WHITE, downhill ? 0.28 : 0.08)
          const farSun = downhill ? 1.05 + 0.2 * steep : 0.72 - 0.16 * steep
          paint(base, crest, farSun, 0, 0)
          paint(base + 3, face, farSun * 0.9, 0, 0)
        }
      }
    }
    r.mesh.geometry.attributes.position.needsUpdate = true
    if (r.col) r.mesh.geometry.attributes.color.needsUpdate = true
  }

  updateSky(camX, camY, dayT) {
    this.sky.position.set(camX, camY, -150)
    let top, bot
    if (dayT >= 0.45) {
      const u = (dayT - 0.45) / 0.55
      top = this.cTop.copy(K_SET_TOP).lerp(K_DAY_TOP, u)
      bot = this.cBot.copy(K_SET_BOT).lerp(K_DAY_BOT, u)
    } else if (dayT >= 0.12) {
      const u = (dayT - 0.12) / 0.33
      top = this.cTop.copy(K_NIGHT_TOP).lerp(K_SET_TOP, u)
      bot = this.cBot.copy(K_NIGHT_BOT).lerp(K_SET_BOT, u)
    } else {
      top = this.cTop.copy(K_NIGHT_TOP)
      bot = this.cBot.copy(K_NIGHT_BOT)
    }
    this.skyMat.uniforms.top.value.copy(top)
    this.skyMat.uniforms.bottom.value.copy(bot)
    this.scene.fog.color.copy(bot)
  }

  updateCelestials(dt, camX, dayT) {
    const p = 1 - dayT
    this.sunG.position.set(camX - 46 + p * 92, 24 - p * 48 + Math.sin(p * Math.PI) * 12, -140)
    const night = Math.max(0, Math.min(1, (0.35 - dayT) / 0.25))
    this.moonG.visible = night > 0.05
    this.moonG.position.set(camX + 24, 8 + (1 - dayT) * 34, -138)
    this.moonMat.opacity = night
    this.craterMat.opacity = night * 0.9
    this.starMat.opacity = night * 0.9
    this.stars.position.x = camX
  }

  updateClouds(dt, camX) {
    for (const c of this.clouds) {
      c.g.position.x += c.vx * dt
      if (c.g.position.x < camX - 150) c.g.position.x += 330
      else if (c.g.position.x > camX + 190) c.g.position.x -= 330
    }
  }

  updateDecor(dt, camX) {
    const want = this.terrain.decorInRange(camX - 140, camX + 240)
    const wantIds = new Set(want.map((w) => w.id))
    for (const w of want) {
      if (this.decor.has(w.id)) continue
      const pool = this.pools[w.type]
      const g = pool.pop() || BUILDERS[w.type](w.type === 'flower' && w.rot > Math.PI)
      g.position.set(w.x, w.y - 0.2, Math.sin(w.id * 12.9898) * 2)
      g.scale.setScalar(w.scale)
      g.rotation.y = w.rot * 0.15
      g.visible = true
      this.decor.set(w.id, { g, type: w.type })
    }
    for (const [id, rec] of Array.from(this.decor)) {
      if (!wantIds.has(id)) {
        rec.g.visible = false
        this.pools[rec.type].push(rec.g)
        this.decor.delete(id)
      }
    }
    for (const rec of this.decor.values()) {
      if (rec.type === 'windmill') rec.g.userData.blades.rotation.z += dt * 1.4
    }
  }

  updateCoins(dt, camX, taken) {
    const want = this.terrain.coinArcsInRange(camX - 140, camX + 240)
    const wantIds = new Set(want.map((w) => w.id))
    for (const w of want) {
      if (this.coinMap.has(w.id)) continue
      const g = this.coinPool.pop() || buildCoin()
      g.position.set(w.x, w.y, 0.8)
      g.scale.setScalar(1)
      g.userData.baseY = w.y
      g.userData.ph = Math.sin(Number(w.id) * 37.7)
      g.visible = !(taken && taken.has(w.id))
      this.coinMap.set(w.id, g)
    }
    for (const [id, g] of Array.from(this.coinMap)) {
      if (!wantIds.has(id)) {
        g.visible = false
        this.coinPool.push(g)
        this.coinMap.delete(id)
      }
    }
    for (const [id, g] of this.coinMap) {
      if (taken && taken.has(id)) g.visible = false
      g.rotation.y += dt * 4
      g.position.y = g.userData.baseY + Math.sin(this.tTotal * 3 + g.userData.ph) * 0.25
    }
  }

  emit(x, y, { count = 8, color = '#ffffff', spread = 4, up = 2, ttl = 0.8, grav = true } = {}) {
    const c = color instanceof THREE.Color ? this.cTmp.copy(color) : this.cTmp.set(color)
    let made = 0
    for (const p of this.p) {
      if (p.life > 0) continue
      p.ttl = ttl * (0.7 + Math.random() * 0.6)
      p.life = p.ttl
      p.x = x
      p.y = y
      p.vx = (Math.random() - 0.5) * spread
      p.vy = up * (0.4 + Math.random())
      p.grav = grav
      const v = 0.85 + Math.random() * 0.3
      p.r = c.r * v
      p.g = c.g * v
      p.b = c.b * v
      if (++made >= count) break
    }
  }

  updateParticles(dt) {
    let n = 0
    for (const p of this.p) {
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.grav) p.vy -= 9 * dt
      this.pPos[n * 3] = p.x
      this.pPos[n * 3 + 1] = p.y
      this.pPos[n * 3 + 2] = 0.6
      this.pCol[n * 3] = p.r
      this.pCol[n * 3 + 1] = p.g
      this.pCol[n * 3 + 2] = p.b
      n++
    }
    this.pGeo.setDrawRange(0, n)
    this.pGeo.attributes.position.needsUpdate = true
    this.pGeo.attributes.color.needsUpdate = true
  }

  updateShadow(bird) {
    if (!bird) {
      this.shadow.visible = false
      return
    }
    const h = this.terrain.height(bird.x)
    const above = bird.y - h
    const s = Math.max(0.15, 1.1 - above * 0.04)
    this.shadow.visible = true
    this.shadow.position.set(bird.x, h + 0.06, 1.6)
    this.shadow.scale.setScalar(s)
    this.shadowMat.opacity = 0.22 * Math.min(1, s)
  }

  update(dt, camX, camY, dayT, extras = {}) {
    this.tTotal += dt
    this.updateSky(camX, camY, dayT)
    this.updateRibbon(this.mainR, camX, dayT)
    this.updateRibbon(this.bgR1, camX, dayT)
    this.updateRibbon(this.bgR2, camX, dayT)
    this.updateCelestials(dt, camX, dayT)
    this.updateClouds(dt, camX)
    this.updateDecor(dt, camX)
    this.updateCoins(dt, camX, extras.taken)
    this.updateParticles(dt)
    this.updateShadow(extras.bird)
  }
}
