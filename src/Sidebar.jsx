import React, { useEffect, useRef } from 'react'
import BlurText from './BlurText'
import TypingText from './TypingText'
import './App.css'

function StatusBadge({ status }) {
  const labelMap = {
    idle: 'Idle',
    connecting: 'Connecting',
    joining: 'Joining room',
    connected: 'Live',
    disconnected: 'Disconnected',
    error: 'Error',
  }

  return (
    <span className={`status-badge status-${status || 'idle'}`}>
      {labelMap[status] || 'Idle'}
    </span>
  )
}

function SectionStack({ list, isSummary = false, emptyLabel = 'No items yet' }) {
  if (!list || list.length === 0) {
    return <div className="section-content empty-content">{emptyLabel}</div>
  }

  const ordered = [...list].reverse()
  const max = ordered.length

  return (
    <div className="section-content history-list">
      {ordered.map((item, index) => {
        const position = max - index
        const opacity = max === 1 ? 1 : 0.3 + 0.7 * (position / max)
        const itemText = isSummary ? item.text : item
        const timestamp = isSummary ? item.timestamp : null

        return (
          <div
            key={isSummary ? String(item?.id || `${itemText}-${index}`) : `${itemText}-${index}`}
            className={`history-item ${isSummary ? 'summary-item' : 'non-summary-item'}`}
            style={!isSummary ? { opacity } : undefined}
          >
            {timestamp ? <span className="item-timestamp">[{formatSummaryTimestamp(timestamp)}]</span> : null}
            <span className="item-text" style={isSummary ? { opacity } : undefined}>
              {isSummary ? (
                <BlurText
                  text={itemText}
                  delay={120}
                  animateBy="words"
                  direction="top"
                  className="summary-text"
                />
              ) : (
                <TypingText text={itemText} speed={12} />
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatSummaryTimestamp(timestamp) {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActionItems({ items, emptyLabel = 'No action items captured yet' }) {
  if (!items || items.length === 0) {
    return <div className="section-content empty-content">{emptyLabel}</div>
  }

  const ordered = [...items].reverse()
  const max = ordered.length

  return (
    <div className="section-content history-list">
      {ordered.map((item, index) => {
        const position = max - index
        const opacity = max === 1 ? 1 : 0.3 + 0.7 * (position / max)
        const taskText = item?.task || ''
        const ownerText = item?.owner || ''
        const deadlineText = item?.deadline || ''

        return (
          <div key={`${taskText}-${index}`} className="action-item-container" style={{ opacity }}>
            <div className="action-item">
              <div className="task-text">
                <TypingText text={taskText} speed={12} />
              </div>
              {ownerText ? <div className="action-meta owner">Owner: {ownerText}</div> : null}
              {deadlineText ? <div className="action-meta deadline">Due: {deadlineText}</div> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChatPanel({
  roomId,
  chatMessages,
  chatInput,
  chatLoading,
  onChatInputChange,
  onSendChat,
}) {
  const scrollRef = useRef(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [chatMessages, chatLoading])

  return (
    <aside className="chat-panel">
      <div className="chat-panel-header">
        <div>
          <p className="chat-panel-kicker">Room Chatbot</p>
          <h2 className="chat-panel-title">Ask about room {roomId}</h2>
        </div>
        <span className="chat-panel-chip">Context aware</span>
      </div>

      <div className="chat-thread" ref={scrollRef}>
        {chatMessages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`chat-bubble chat-${message.role} ${message.tone === 'error' ? 'chat-error' : ''}`}
          >
            <span className="chat-role">{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
            <p>{message.text}</p>
          </div>
        ))}
        {chatLoading ? (
          <div className="chat-bubble chat-assistant chat-loading">
            <span className="chat-role">Assistant</span>
            <p>Thinking about the current meeting context...</p>
          </div>
        ) : null}
      </div>

      <form className="chat-form" onSubmit={onSendChat}>
        <textarea
          className="chat-input"
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          placeholder="Ask what was decided, who owns a task, or what is still open..."
          rows={4}
        />
        <button type="submit" className="chat-submit" disabled={!chatInput.trim() || chatLoading}>
          Send
        </button>
      </form>
    </aside>
  )
}

export default function Sidebar({
  roomId,
  connectionStatus,
  state,
  captionsRef,
  chatMessages,
  chatInput,
  chatLoading,
  onChatInputChange,
  onSendChat,
  onLeaveRoom,
}) {
  const summaries = state?.summaries || []
  const actionItems = state?.actionItems || []
  const openQuestions = state?.openQuestions || []
  const captions = captionsRef?.current || { finalizedLines: [], partialLines: [] }

  return (
    <div className="layout-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Live Meeting Room</p>
          <h1 className="room-heading">{roomId}</h1>
        </div>
        <div className="topbar-actions">
          <StatusBadge status={connectionStatus} />
          <button type="button" className="secondary-button" onClick={onLeaveRoom}>
            Change Room
          </button>
        </div>
      </header>

      <div className="content-grid">
        <div className="layout-root">
          <div className="three-columns">
            <section className="col">
              <h2 className="section-title">Summary</h2>
              <div className="section-scroll">
                <SectionStack
                  list={summaries}
                  isSummary
                  emptyLabel="Waiting for summary updates in this room..."
                />
              </div>
            </section>

            <section className="col">
              <h2 className="section-title">Action Items</h2>
              <div className="section-scroll">
                <ActionItems items={actionItems} />
              </div>
            </section>

            <section className="col">
              <h2 className="section-title">Open Questions</h2>
              <div className="section-scroll">
                <SectionStack list={openQuestions} emptyLabel="No open questions captured yet" />
              </div>
            </section>
          </div>

          <div className="global-caption-area" aria-live="polite">
            {Array.isArray(captions.finalizedLines) &&
              captions.finalizedLines.map((line, index) => (
                <div key={`f-${index}-${line}`} className="caption-line">
                  <BlurText
                    text={line}
                    delay={0}
                    speed={28}
                    animateBy="words"
                    direction="top"
                    className="caption-blur-text"
                  />
                </div>
              ))}
            {Array.isArray(captions.partialLines) &&
              captions.partialLines.map((line, index) => (
                <div key={`p-${index}-${line}`} className="caption-line caption-partial">
                  <BlurText
                    text={`${line} *`}
                    delay={0}
                    speed={24}
                    animateBy="words"
                    direction="top"
                    className="caption-blur-text"
                  />
                </div>
              ))}
          </div>
        </div>

        <ChatPanel
          roomId={roomId}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatLoading={chatLoading}
          onChatInputChange={onChatInputChange}
          onSendChat={onSendChat}
        />
      </div>
    </div>
  )
}
