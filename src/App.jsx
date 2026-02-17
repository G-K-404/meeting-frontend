import { useState, useEffect, useRef } from 'react'
import './App.css'
import Sidebar from './Sidebar'

const WS_URL = 'ws://localhost:8766'
const CAPTION_WS_URL = 'ws://localhost:8767'
const CAPTION_MAX_LINES = 3
const CAPTION_MAX_CHARS_PER_LINE = 50

function splitCaption(text, maxCharsPerLine = CAPTION_MAX_CHARS_PER_LINE) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

function App() {
  const [state, setState] = useState({
    summaries: [], // history of summaries (old -> new)
    actionItems: [], // flattened history of action item strings
    openQuestions: [], // history of open questions
  })
  const wsRef = useRef(null)
  const captionWsRef = useRef(null)
  // Use refs for real-time caption updates without state batching latency
  const captionsRef = useRef({ finalizedLines: [], partialLines: [] })
  const [, setCaptionTrigger] = useState(0)

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.addEventListener('open', () => console.log('WebSocket connected'))
    ws.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse(ev.data)

        setState((prev) => {
          const next = { ...prev }

          // handle summary stream
          const incomingSummary = (payload.summary || '').trim()
          if (incomingSummary) {
            const lastSummary = prev.summaries[prev.summaries.length - 1]
            const lastText = lastSummary && lastSummary.text
            if (incomingSummary !== lastText) {
              const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              next.summaries = prev.summaries.concat({ text: incomingSummary, timestamp }).slice(-100)
            }
          }

          // handle action items (payload.action_items expected array of objects)
          if (Array.isArray(payload.action_items)) {
            // Store the full action item objects, not just task strings
            const newItems = payload.action_items.filter((item) => {
              if (!item) return false
              // Check if this item is already in our history (by task text)
              const taskText = (item.task || '').trim()
              return taskText && !prev.actionItems.some(existing => {
                const existingTask = typeof existing === 'string' ? existing : (existing.task || '').trim()
                return existingTask === taskText
              })
            })
            if (newItems.length) {
              next.actionItems = prev.actionItems.concat(newItems).slice(-200)
            }
          }

          // handle open questions
          if (Array.isArray(payload.open_questions)) {
            const qs = payload.open_questions.map((q) => String(q || ''))
            const newQs = qs.filter((q) => q && !prev.openQuestions.includes(q))
            if (newQs.length) {
              next.openQuestions = prev.openQuestions.concat(newQs).slice(-200)
            }
          }

          return next
        })
      } catch (e) {
        console.warn('Invalid message', e)
      }
    })
    ws.addEventListener('close', () => console.log('WebSocket closed'))

    return () => ws.close()
  }, [])

  // Connect to the local caption websocket (port 8767) and update state.captions
  useEffect(() => {
    let wsCap
    try {
      wsCap = new WebSocket(CAPTION_WS_URL)
    } catch (e) {
      console.warn('Caption WS connect failed', e)
      return
    }
    captionWsRef.current = wsCap
    wsCap.addEventListener('open', () => console.log('Caption WS connected'))
    wsCap.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse(ev.data)
        const type = payload.type
        const text = String(payload.text || '')

        if (type === 'partial') {
          captionsRef.current.partialLines = splitCaption(text)
          setCaptionTrigger(x => x + 1)
        } else if (type === 'final') {
          const finalLines = splitCaption(text)
          const keepCount = CAPTION_MAX_LINES - 1
          captionsRef.current.partialLines = []
          captionsRef.current.finalizedLines = captionsRef.current.finalizedLines
            .concat(finalLines)
            .slice(-keepCount)
          setCaptionTrigger(x => x + 1)
        }
      } catch (e) {
        console.warn('Invalid caption message', e)
      }
    })
    wsCap.addEventListener('close', () => console.log('Caption WS closed'))

    return () => {
      try {
        wsCap.close()
      } catch (e) {}
    }
  }, [])

  return (
    <div className="app-root full-screen">
      <Sidebar state={state} captionsRef={captionsRef} />
    </div>
  )
}

export default App
