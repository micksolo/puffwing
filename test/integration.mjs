import WebSocket from 'ws'

const DEBUG_PORT = 9333
const URL = process.argv[2] || 'http://localhost:4173'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const list = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json())
  const page = list.find((p) => p.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      console.log('PAGE ERROR:', msg.params.args.map((a) => a.value || a.description).join(' '))
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('PAGE EXCEPTION:', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description || '')
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id
      pending.set(mid, res)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.result?.value
  }

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: URL })
  await sleep(2500)

  const boot = await evalJs('!!window.__puffwing && !!document.getElementById("board")')
  console.log('boot:', boot)
  const board = await evalJs('document.getElementById("board").innerText')
  console.log('board:', JSON.stringify(board))

  await evalJs('document.getElementById("playdaily").click()')
  await sleep(800)
  let playing = await evalJs('window.__puffwing.state.screen')
  console.log('screen after click:', playing)
  const name = await evalJs('document.getElementById("name").value')
  console.log('name:', name)

  for (let round = 0; round < 8; round++) {
    await evalJs('window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }))')
    await sleep(900)
    await evalJs('window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }))')
    await sleep(700)
  }
  const dist = await evalJs('window.__puffwing.state.run.distance')
  console.log('distance after ~13s:', dist)
  if (!(dist > 0)) throw new Error('bird did not move')

  await evalJs('window.__puffwing.state.run.dayLeft = 0; window.__puffwing.state.run.postNight = 11.9')
  await sleep(1500)
  const screen = await evalJs('window.__puffwing.state.screen')
  console.log('screen after nightfall:', screen)
  if (screen !== 'over') throw new Error('run did not end')

  await sleep(1500)
  const score = await evalJs('document.getElementById("finalscore").textContent')
  const status = await evalJs('document.getElementById("submitstatus").textContent')
  const board2 = await evalJs('document.getElementById("board2").innerText')
  console.log('final score:', score)
  console.log('submit status:', status)
  console.log('board2:', JSON.stringify(board2))

  await evalJs('document.getElementById("retry").click()')
  await sleep(500)
  const again = await evalJs('window.__puffwing.state.screen')
  console.log('screen after retry:', again)

  console.log('ALL INTEGRATION CHECKS DONE')
  ws.close()
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message)
  process.exit(1)
})
