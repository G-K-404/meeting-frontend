import React from 'react'
import TypingText from './TypingText'
import BlurText from './BlurText'
import './App.css'

export default function Sidebar({ state, captionsRef }) {
  const summaries = (state && state.summaries) || []
  const actionItems = (state && state.actionItems) || []
  const openQuestions = (state && state.openQuestions) || []
  const captions = captionsRef?.current || { finalizedLines: [], partialLines: [] }
  const handleCaptionAnimationComplete = () => {}

  function renderStack(list, isSummary = false, emptyLabel = 'No items yet', newestAtBottom = false) {
    if (!list || list.length === 0) return <div className="section-content empty-content">{emptyLabel}</div>

    const ordered = newestAtBottom ? [...list] : [...list].reverse()
    const max = ordered.length
    return (
      <div className="section-content history-list">
        {ordered.map((item, i) => {
          const position = max - i
          const opacity = max === 1 ? 1 : 0.3 + 0.7 * (position / max)
          const itemText = isSummary ? item.text : item
          const timestamp = isSummary && ordered.length > 0 ? item.timestamp : null

          return (
            <div key={i} className={`history-item ${isSummary ? 'summary-item' : 'non-summary-item'}`} style={!isSummary ? { opacity } : undefined}>
              {timestamp && <span className="item-timestamp">[{timestamp}]</span>}
              <span className="item-text" style={isSummary ? { opacity } : undefined}>
                {isSummary ? (
                  <BlurText
                    text={itemText}
                    delay={200}
                    animateBy="words"
                    direction="top"
                    className="summary-text"
                  />
                ) : (
                  <TypingText text={itemText} speed={15} delay={50} />
                )}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  function renderActionItems(items, emptyLabel = 'No action items yet') {
    if (!items || items.length === 0) return <div className="section-content empty-content">{emptyLabel}</div>

    const ordered = [...items].reverse()
    const max = ordered.length
    return (
      <div className="section-content history-list">
        {ordered.map((item, i) => {
          const position = max - i
          const opacity = max === 1 ? 1 : 0.3 + 0.7 * (position / max)

          let taskText = ''
          let ownerText = ''
          let deadlineText = ''

          if (typeof item === 'string') {
            taskText = item
          } else if (item && typeof item === 'object') {
            taskText = item.task || ''
            ownerText = item.owner || ''
            deadlineText = item.deadline || ''
          }

          return (
            <div key={i} className="action-item-container" style={{ opacity }}>
              <div className="action-item">
                <div className="task-text">
                  <TypingText text={taskText} speed={15} delay={50} />
                </div>
                {ownerText && <div className="action-meta owner">Owner: {ownerText}</div>}
                {deadlineText && <div className="action-meta deadline">Due: {deadlineText}</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="layout-root">
      <div className="three-columns">
        <section className="col">
          <h2 className="section-title">Summary</h2>
          <div className="section-scroll">
            {renderStack(summaries, true, 'Waiting for summary updates...', true)}
          </div>
        </section>

        <section className="col">
          <h2 className="section-title">Action Items</h2>
          <div className="section-scroll">
            {renderActionItems(actionItems, 'No action items captured yet')}
          </div>
        </section>

        <section className="col">
          <h2 className="section-title">Open Questions</h2>
          <div className="section-scroll">
            {renderStack(openQuestions, false, 'No open questions captured yet')}
          </div>
        </section>
      </div>

      <div className="global-caption-area" aria-live="polite">
        {Array.isArray(captions.finalizedLines) && captions.finalizedLines.map((line, idx) => (
          <div key={`f-${idx}-${line}`} className="caption-line">
            <BlurText
              text={line}
              delay={0}
              speed={28}
              animateBy="words"
              direction="top"
              onAnimationComplete={handleCaptionAnimationComplete}
              className="caption-blur-text"
            />
          </div>
        ))}
        {Array.isArray(captions.partialLines) && captions.partialLines.map((line, idx) => (
          <div key={`p-${idx}-${line}`} className="caption-line caption-partial">
            <BlurText
              text={`${line} *`}
              delay={0}
              speed={24}
              animateBy="words"
              direction="top"
              onAnimationComplete={handleCaptionAnimationComplete}
              className="caption-blur-text"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
