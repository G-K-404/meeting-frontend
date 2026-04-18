import { useEffect, useRef, useState } from 'react'
import './App.css'
import Sidebar from './Sidebar'

const WS_URL = 'ws://localhost:8766'
const CAPTION_WS_URL = 'ws://localhost:8767'
const CHAT_API_URL = 'http://localhost:8080'
const CAPTION_MAX_LINES = 3
const CAPTION_MAX_CHARS_PER_LINE = 50

const EMPTY_MEETING_STATE = {
  summary: '',
  action_items: [],
  open_questions: [],
}

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

function createDashboardState() {
  return {
    summaries: [],
    actionItems: [],
    openQuestions: [],
  }
}

function normalizeMeetingState(payload) {
  if (!payload || typeof payload !== 'object') {
    return EMPTY_MEETING_STATE
  }

  if (payload.state && typeof payload.state === 'object') {
    return normalizeMeetingState(payload.state)
  }

  return {
    summary: String(payload.summary || '').trim(),
    action_items: Array.isArray(payload.action_items) ? payload.action_items : [],
    open_questions: Array.isArray(payload.open_questions) ? payload.open_questions : [],
  }
}

function App() {
  const [draftRoomId, setDraftRoomId] = useState('')
  const [activeRoomId, setActiveRoomId] = useState('')
  const [joinError, setJoinError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('idle')
  const [state, setState] = useState(createDashboardState)
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Join a room to ask questions about the live meeting summary.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const wsRef = useRef(null)
  const captionWsRef = useRef(null)
  const joinedRoomRef = useRef('')
  const captionsRef = useRef({ finalizedLines: [], partialLines: [] })
  const [, setCaptionTrigger] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadMeetingState() {
      if (!activeRoomId) return

      try {
        const response = await fetch(
          `${CHAT_API_URL}/meeting-state?room_id=${encodeURIComponent(activeRoomId)}`,
        )

        if (!response.ok) {
          throw new Error(`Failed to load meeting state (${response.status})`)
        }

        const payload = await response.json()
        if (cancelled) return
        applyMeetingState(normalizeMeetingState(payload))
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to fetch meeting state', error)
        }
      }
    }

    loadMeetingState()

    return () => {
      cancelled = true
    }
  }, [activeRoomId])

  useEffect(() => {
    if (!activeRoomId) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setConnectionStatus('idle')
      return undefined
    }

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    joinedRoomRef.current = ''
    setConnectionStatus('connecting')

    ws.addEventListener('open', () => {
      setConnectionStatus('joining')
      ws.send(JSON.stringify({ type: 'join_room', room_id: activeRoomId }))
    })

    ws.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!payload || typeof payload !== 'object') return

        if (payload.type === 'room_joined') {
          joinedRoomRef.current = String(payload.room_id || activeRoomId)
          setConnectionStatus('connected')
          setJoinError('')
          return
        }

        if (payload.type === 'error') {
          setJoinError(String(payload.message || 'Failed to join room'))
          setConnectionStatus('error')
          return
        }

        if (payload.type === 'meeting_state') {
          if (String(payload.room_id || '') !== activeRoomId) return
          applyMeetingState(normalizeMeetingState(payload))
        }
      } catch (error) {
        console.warn('Invalid websocket message', error)
      }
    })

    ws.addEventListener('close', () => {
      if (wsRef.current === ws) {
        wsRef.current = null
      }
      joinedRoomRef.current = ''
      setConnectionStatus((current) => (current === 'idle' ? current : 'disconnected'))
    })

    ws.addEventListener('error', () => {
      setConnectionStatus('error')
      setJoinError('Could not connect to the meeting websocket server.')
    })

    return () => {
      ws.close()
    }
  }, [activeRoomId])

  useEffect(() => {
    let wsCap

    try {
      wsCap = new WebSocket(CAPTION_WS_URL)
    } catch (error) {
      console.warn('Caption WS connect failed', error)
      return undefined
    }

    captionWsRef.current = wsCap

    wsCap.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data)
        const type = payload.type
        const text = String(payload.text || '')

        if (type === 'partial') {
          captionsRef.current.partialLines = splitCaption(text)
          setCaptionTrigger((value) => value + 1)
        } else if (type === 'final') {
          const finalLines = splitCaption(text)
          const keepCount = CAPTION_MAX_LINES - 1
          captionsRef.current.partialLines = []
          captionsRef.current.finalizedLines = captionsRef.current.finalizedLines
            .concat(finalLines)
            .slice(-keepCount)
          setCaptionTrigger((value) => value + 1)
        }
      } catch (error) {
        console.warn('Invalid caption message', error)
      }
    })

    return () => {
      try {
        wsCap.close()
      } catch {
        // no-op
      }
    }
  }, [])

  function applyMeetingState(meetingState) {
    setState((previous) => {
      const next = { ...previous }
      const incomingSummary = meetingState.summary

      if (incomingSummary) {
        const lastSummary = previous.summaries[previous.summaries.length - 1]
        const lastText = lastSummary?.text
        if (incomingSummary !== lastText) {
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })
          next.summaries = previous.summaries
            .concat({ text: incomingSummary, timestamp })
            .slice(-100)
        }
      }

      if (Array.isArray(meetingState.action_items)) {
        const newItems = meetingState.action_items.filter((item) => {
          if (!item) return false
          const taskText = String(item.task || '').trim()
          return (
            taskText &&
            !previous.actionItems.some((existing) => String(existing?.task || '').trim() === taskText)
          )
        })
        if (newItems.length) {
          next.actionItems = previous.actionItems.concat(newItems).slice(-200)
        }
      }

      if (Array.isArray(meetingState.open_questions)) {
        const newQuestions = meetingState.open_questions
          .map((item) => String(item || '').trim())
          .filter((item) => item && !previous.openQuestions.includes(item))
        if (newQuestions.length) {
          next.openQuestions = previous.openQuestions.concat(newQuestions).slice(-200)
        }
      }

      return next
    })
  }

  function handleJoinRoom(event) {
    event.preventDefault()
    const normalizedRoomId = draftRoomId.trim()

    if (!normalizedRoomId) {
      setJoinError('Enter a room ID first.')
      return
    }

    setJoinError('')
    setActiveRoomId(normalizedRoomId)
    setState(createDashboardState())
    setChatMessages([
      {
        role: 'assistant',
        text: `Joined room "${normalizedRoomId}". Ask anything about this meeting.`,
      },
    ])
    captionsRef.current = { finalizedLines: [], partialLines: [] }
    setCaptionTrigger((value) => value + 1)
  }

  function handleLeaveRoom() {
    setActiveRoomId('')
    setDraftRoomId('')
    setJoinError('')
    setConnectionStatus('idle')
    setState(createDashboardState())
    setChatInput('')
    setChatLoading(false)
    setChatMessages([
      {
        role: 'assistant',
        text: 'Join a room to ask questions about the live meeting summary.',
      },
    ])
    captionsRef.current = { finalizedLines: [], partialLines: [] }
    setCaptionTrigger((value) => value + 1)
  }

  async function handleSendChat(event) {
    event.preventDefault()

    const question = chatInput.trim()
    if (!question || !activeRoomId || chatLoading) return

    setChatMessages((previous) => previous.concat({ role: 'user', text: question }))
    setChatInput('')
    setChatLoading(true)

    try {
      const response = await fetch(`${CHAT_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_id: activeRoomId,
          message: question,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || `Request failed with status ${response.status}`)
      }

      setChatMessages((previous) =>
        previous.concat({
          role: 'assistant',
          text: String(payload.answer || 'No answer returned.'),
        }),
      )
    } catch (error) {
      setChatMessages((previous) =>
        previous.concat({
          role: 'assistant',
          text: `Chat request failed: ${error.message}`,
          tone: 'error',
        }),
      )
    } finally {
      setChatLoading(false)
    }
  }

  const showJoinScreen = !activeRoomId

  return (
    <div className="app-root full-screen">
      {showJoinScreen ? (
        <main className="join-screen">
          <div className="join-card">
            <p className="eyebrow">Realtime Meeting Summarizer</p>
            <h1 className="join-title">Enter a room ID to join the live meeting workspace.</h1>
            <p className="join-copy">
              The dashboard and chatbot will stay scoped to that room, so different meetings do not
              mix with each other.
            </p>

            <form className="join-form" onSubmit={handleJoinRoom}>
              <label className="join-label" htmlFor="room-id">
                Room ID
              </label>
              <div className="join-row">
                <input
                  id="room-id"
                  className="room-input"
                  value={draftRoomId}
                  onChange={(event) => setDraftRoomId(event.target.value)}
                  placeholder="example: team-sync-01"
                  autoFocus
                />
                <button type="submit" className="join-button">
                  Join Room
                </button>
              </div>
            </form>

            {joinError ? <p className="join-error">{joinError}</p> : null}
          </div>
        </main>
      ) : (
        <Sidebar
          roomId={activeRoomId}
          connectionStatus={connectionStatus}
          state={state}
          captionsRef={captionsRef}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatLoading={chatLoading}
          onChatInputChange={setChatInput}
          onSendChat={handleSendChat}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  )
}

export default App
