import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

// Estimate syllables in a word
function estimateSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (word.length <= 3) return 1

  const vowels = 'aeiouy'
  let count = 0
  let prevWasVowel = false

  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i])
    if (isVowel && !prevWasVowel) {
      count++
    }
    prevWasVowel = isVowel
  }

  if (word.endsWith('e') && count > 1) count--
  if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++

  return Math.max(1, count)
}

function getWordWeight(word) {
  const cleanWord = word.replace(/[^a-zA-Z]/g, '')
  const syllables = estimateSyllables(cleanWord)
  const lengthFactor = Math.max(1, cleanWord.length / 4)
  return syllables * 0.7 + lengthFactor * 0.3
}

// Parse markdown formatting from a word
function parseWordFormatting(word) {
  let text = word
  let bold = false
  let italic = false

  if ((text.startsWith('**') && text.endsWith('**')) ||
      (text.startsWith('__') && text.endsWith('__'))) {
    bold = true
    text = text.slice(2, -2)
  }

  if ((text.startsWith('*') && text.endsWith('*') && !text.startsWith('**')) ||
      (text.startsWith('_') && text.endsWith('_') && !text.startsWith('__'))) {
    italic = true
    text = text.slice(1, -1)
  }

  return { text, bold, italic }
}

// Parse script into speaker sections
function parseScript(script) {
  let cleaned = script.replace(/==(.*?)==/g, '$1')

  const speakerRegex = /\[([^\]]+)\]:/g
  const sections = []
  let lastIndex = 0
  let match

  while ((match = speakerRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const content = cleaned.slice(lastIndex, match.index).trim()
      if (content) {
        sections.push({ speaker: null, content })
      }
    }
    lastIndex = match.index + match[0].length

    const nextMatch = speakerRegex.exec(cleaned)
    const endIndex = nextMatch ? nextMatch.index : cleaned.length
    speakerRegex.lastIndex = lastIndex

    const content = cleaned.slice(lastIndex, endIndex).trim()
    if (content) {
      sections.push({ speaker: match[1], content })
    }
    lastIndex = endIndex
  }

  if (lastIndex < cleaned.length) {
    const content = cleaned.slice(lastIndex).trim()
    if (content) {
      sections.push({ speaker: null, content })
    }
  }

  if (sections.length === 0 && cleaned.trim()) {
    sections.push({ speaker: null, content: cleaned.trim() })
  }

  return sections
}

// Parse section content into words with line break markers
function parseWords(content) {
  const lines = content.split('\n')
  const words = []

  lines.forEach((line, lineIndex) => {
    const lineWords = line.trim().split(/\s+/).filter(w => w.length > 0)
    lineWords.forEach((word, wordIndex) => {
      const formatted = parseWordFormatting(word)
      words.push({
        ...formatted,
        isLineStart: wordIndex === 0 && lineIndex > 0
      })
    })
  })

  return words
}

function App() {
  const [script, setScript] = useState('')
  const [targetMinutes, setTargetMinutes] = useState(1)
  const [targetSeconds, setTargetSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [showInput, setShowInput] = useState(true)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [countdown, setCountdown] = useState(null)
  const [wordPositions, setWordPositions] = useState([])

  // Parse script into sections and flatten words
  const { sections, allWords, sectionBoundaries } = useMemo(() => {
    const sections = parseScript(script)
    const allWords = []
    const sectionBoundaries = []

    sections.forEach((section) => {
      const startIndex = allWords.length
      const words = parseWords(section.content)
      words.forEach(word => {
        allWords.push({ ...word, speaker: section.speaker })
      })
      sectionBoundaries.push({
        startIndex,
        endIndex: allWords.length - 1,
        speaker: section.speaker
      })
    })

    return { sections, allWords, sectionBoundaries }
  }, [script])

  const totalWords = allWords.length
  const targetTimeMs = (targetMinutes * 60 + targetSeconds) * 1000

  // Calculate timing for each word
  const wordTimings = useMemo(() => {
    const weights = allWords.map(w => getWordWeight(w.text))
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    return weights.map(weight =>
      totalWeight > 0 ? (weight / totalWeight) * targetTimeMs : 0
    )
  }, [allWords, targetTimeMs])

  // Calculate cumulative start time for each word
  const wordStartTimes = useMemo(() => {
    const startTimes = []
    let cumulative = 0
    for (let i = 0; i < wordTimings.length; i++) {
      startTimes.push(cumulative)
      cumulative += wordTimings[i]
    }
    return startTimes
  }, [wordTimings])

  const averageWPM = totalWords > 0 && targetTimeMs > 0
    ? Math.round(totalWords / (targetTimeMs / 60000))
    : 0

  const animationRef = useRef(null)
  const startTimeRef = useRef(null)
  const wordDisplayRef = useRef(null)
  const scrollContentRef = useRef(null)

  // Measure word positions after render
  const measureWordPositions = () => {
    if (!wordDisplayRef.current || !scrollContentRef.current) return []

    const container = wordDisplayRef.current
    const content = scrollContentRef.current
    const contentRect = content.getBoundingClientRect()
    const positions = []

    for (let i = 0; i < allWords.length; i++) {
      const wordEl = content.querySelector(`[data-word-index="${i}"]`)
      if (wordEl) {
        const rect = wordEl.getBoundingClientRect()
        positions.push({
          top: rect.top - contentRect.top,
          center: rect.top - contentRect.top + rect.height / 2
        })
      }
    }

    return positions
  }

  // Find which word should be active at a given elapsed time
  const getWordIndexAtTime = (elapsed) => {
    for (let i = wordStartTimes.length - 1; i >= 0; i--) {
      if (elapsed >= wordStartTimes[i]) {
        return i
      }
    }
    return 0
  }

  // Get scroll position for a given elapsed time (smooth interpolation)
  const getScrollPositionAtTime = (elapsed, positions) => {
    if (positions.length === 0) return 0

    const containerHeight = wordDisplayRef.current?.clientHeight || 0
    const currentIdx = getWordIndexAtTime(elapsed)
    const nextIdx = Math.min(currentIdx + 1, positions.length - 1)

    const currentWordStart = wordStartTimes[currentIdx]
    const currentWordDuration = wordTimings[currentIdx]

    // Progress through current word (0 to 1)
    const wordProgress = currentWordDuration > 0
      ? Math.min((elapsed - currentWordStart) / currentWordDuration, 1)
      : 0

    // Interpolate between current and next word positions
    const currentY = positions[currentIdx]?.center || 0
    const nextY = positions[nextIdx]?.center || currentY

    const interpolatedY = currentY + (nextY - currentY) * wordProgress

    // Center in viewport
    return Math.max(0, interpolatedY - containerHeight / 2)
  }

  // Main animation loop - drives both word highlighting and scrolling
  const runAnimation = () => {
    if (!startTimeRef.current || !scrollContentRef.current) return

    const elapsed = Date.now() - startTimeRef.current
    const positions = wordPositions

    // Update elapsed time display
    setElapsedTime(elapsed)

    // Determine current word from elapsed time
    const wordIdx = getWordIndexAtTime(elapsed)
    setCurrentWordIndex(wordIdx)

    // Calculate and apply scroll position
    const scrollY = getScrollPositionAtTime(elapsed, positions)
    scrollContentRef.current.style.transform = `translateY(${-scrollY}px)`

    // Continue animation if not finished
    if (elapsed < targetTimeMs && wordIdx < allWords.length - 1) {
      animationRef.current = requestAnimationFrame(runAnimation)
    } else {
      setIsPlaying(false)
    }
  }

  const stopAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }

  // Start animation when playing
  useEffect(() => {
    if (isPlaying && wordPositions.length > 0) {
      animationRef.current = requestAnimationFrame(runAnimation)
    }
    return () => stopAnimation()
  }, [isPlaying, wordPositions])

  const startPlayback = () => {
    // Measure positions right before starting
    const positions = measureWordPositions()
    setWordPositions(positions)

    setCurrentWordIndex(0)
    setElapsedTime(0)
    startTimeRef.current = Date.now()
    setIsPlaying(true)
  }

  const handleStart = () => {
    if (allWords.length === 0) return
    setShowInput(false)
    setCurrentWordIndex(0)
    setCountdown(3)

    setTimeout(() => setCountdown(2), 1000)
    setTimeout(() => setCountdown(1), 2000)
    setTimeout(() => {
      setCountdown(null)
      // Small delay to ensure DOM is ready, then measure and start
      requestAnimationFrame(() => {
        startPlayback()
      })
    }, 3000)
  }

  const handlePause = () => {
    setIsPlaying(false)
    stopAnimation()
  }

  const handleResume = () => {
    if (currentWordIndex >= 0 && currentWordIndex < allWords.length - 1) {
      // Adjust start time to account for elapsed time
      startTimeRef.current = Date.now() - elapsedTime
      setIsPlaying(true)
    }
  }

  const handleReset = () => {
    setIsPlaying(false)
    setCurrentWordIndex(-1)
    setElapsedTime(0)
    setShowInput(true)
    setWordPositions([])
    stopAnimation()
    startTimeRef.current = null

    if (scrollContentRef.current) {
      scrollContentRef.current.style.transform = 'translateY(0)'
    }
  }

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const isFinished = currentWordIndex >= allWords.length - 1

  // Render words grouped by section
  const renderWords = () => {
    const elements = []

    sectionBoundaries.forEach((section, sectionIdx) => {
      // Add speaker divider
      if (sectionIdx > 0 && section.speaker) {
        elements.push(
          <div key={`divider-${sectionIdx}`} className="speaker-divider">
            <span className="speaker-name">{section.speaker}</span>
          </div>
        )
      }

      if (sectionIdx === 0 && section.speaker) {
        elements.push(
          <div key={`speaker-${sectionIdx}`} className="speaker-divider first">
            <span className="speaker-name">{section.speaker}</span>
          </div>
        )
      }

      const sectionWords = []
      for (let i = section.startIndex; i <= section.endIndex; i++) {
        const word = allWords[i]
        const isCurrent = i === currentWordIndex
        const isPast = i < currentWordIndex

        sectionWords.push(
          <span key={i}>
            {word.isLineStart && <br />}
            <span
              data-word-index={i}
              className={`word ${
                isCurrent ? 'current' :
                isPast ? 'past' :
                'future'
              } ${word.bold ? 'bold' : ''} ${word.italic ? 'italic' : ''}`}
            >
              {word.text}
            </span>
            {' '}
          </span>
        )
      }

      elements.push(
        <div key={`section-${sectionIdx}`} className="section">
          {sectionWords}
        </div>
      )
    })

    return elements
  }

  return (
    <div className="app">
      {showInput ? (
        <div className="input-container">
          <h1>Teleprompter</h1>

          <div className="script-section">
            <label htmlFor="script">Paste your script:</label>
            <textarea
              id="script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={`Enter your script here...

Use [Speaker]: to mark speaker sections, e.g.:

[Kevin]:
Hey, my name is Kevin...

[Mark]:
And I'm Mark...`}
              rows={12}
            />
          </div>

          <div className="stats">
            <span>Words: {totalWords}</span>
            {sectionBoundaries.length > 1 && (
              <span>Speakers: {sectionBoundaries.filter(s => s.speaker).map(s => s.speaker).join(', ')}</span>
            )}
          </div>

          <div className="time-section">
            <label>Target reading time:</label>
            <div className="time-inputs">
              <div className="time-input-group">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span>min</span>
              </div>
              <div className="time-input-group">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={targetSeconds}
                  onChange={(e) => setTargetSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                />
                <span>sec</span>
              </div>
            </div>
          </div>

          {totalWords > 0 && targetTimeMs > 0 && (
            <div className="calculated-wpm">
              Calculated pace: <strong>{averageWPM} WPM</strong>
            </div>
          )}

          <button
            className="start-button"
            onClick={handleStart}
            disabled={totalWords === 0}
          >
            Start Teleprompter
          </button>
        </div>
      ) : (
        <div className="teleprompter-container">
          {countdown !== null && (
            <div className="countdown-overlay">
              <span key={countdown} className="countdown-number">{countdown}</span>
            </div>
          )}
          <div className="teleprompter-header">
            <span className="timer">{formatTime(elapsedTime)} / {formatTime(targetTimeMs)}</span>
            <span className="progress">{Math.max(0, currentWordIndex + 1)}/{totalWords}</span>
            <span className="wpm-display">{averageWPM} WPM</span>
            <div className="controls">
              {isPlaying ? (
                <button onClick={handlePause}>Pause</button>
              ) : (
                <button onClick={handleResume} disabled={isFinished}>
                  {isFinished ? 'Done' : 'Resume'}
                </button>
              )}
              <button onClick={handleReset}>Reset</button>
            </div>
          </div>

          <div className="word-display" ref={wordDisplayRef}>
            <div className="scroll-content" ref={scrollContentRef}>
              {renderWords()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
