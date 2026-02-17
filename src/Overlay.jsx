import { useEffect, useState } from 'react'
import './App.css'

const WS_URL = 'ws://localhost:8766'

export default function Overlay() {
  const [text, setText] = useState('Waiting for captions...')

  useEffect(() => {
    const ws = new WebSocket(WS_URL)

    ws.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse(ev.data)
        if (payload.transcript) setText(payload.transcript)
      } catch (e) {
        // ignore
      }
    })

    return () => ws.close()
  }, [])

  return (
    <div className="overlay-root">
      <div className="subtitle">{text}</div>
    </div>
  )
}
