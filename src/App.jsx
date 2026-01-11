import { useState, useEffect, useRef, useMemo } from 'react'
import { Play, Pause, RotateCcw, X } from 'lucide-react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import * as Popover from '@radix-ui/react-popover'
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

function getWordWeight(word, isBeforeLineBreak = false) {
  const cleanWord = word.replace(/[^a-zA-Z]/g, '')
  const syllables = estimateSyllables(cleanWord)
  const lengthFactor = Math.max(1, cleanWord.length / 4)

  let baseWeight = syllables * 0.7 + lengthFactor * 0.3

  // Add pause for punctuation
  if (/[.!?]$/.test(word)) {
    // Sentence-ending punctuation: longer pause
    baseWeight += 1.5
  } else if (/[,;:\u2014\u2013]$/.test(word) || word.endsWith('—') || word.endsWith('–')) {
    // Clause punctuation (comma, semicolon, colon, em-dash): medium pause
    baseWeight += 0.8
  }

  // Add pause before line breaks
  if (isBeforeLineBreak) {
    baseWeight += 1.0
  }

  return baseWeight
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

  // Find all speaker markers and their positions
  const speakerRegex = /\[([^\]]+)\]:/g
  const markers = []
  let match

  while ((match = speakerRegex.exec(cleaned)) !== null) {
    markers.push({
      speaker: match[1],
      start: match.index,
      end: match.index + match[0].length
    })
  }

  const sections = []

  // If no markers, treat whole script as one section
  if (markers.length === 0) {
    if (cleaned.trim()) {
      sections.push({ speaker: null, content: cleaned.trim() })
    }
    return sections
  }

  // Content before first speaker
  if (markers[0].start > 0) {
    const content = cleaned.slice(0, markers[0].start).trim()
    if (content) {
      sections.push({ speaker: null, content })
    }
  }

  // Process each speaker section
  markers.forEach((marker, i) => {
    const contentStart = marker.end
    const contentEnd = i < markers.length - 1 ? markers[i + 1].start : cleaned.length
    const content = cleaned.slice(contentStart, contentEnd).trim()

    if (content) {
      sections.push({ speaker: marker.speaker, content })
    }
  })

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

// Load from localStorage
const loadFromStorage = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key)
    return saved !== null ? JSON.parse(saved) : defaultValue
  } catch {
    return defaultValue
  }
}

function App() {
  const [script, setScript] = useState(() => loadFromStorage('teleprompter-script', ''))
  const [targetMinutes, setTargetMinutes] = useState(() => loadFromStorage('teleprompter-minutes', 1))
  const [targetSeconds, setTargetSeconds] = useState(() => loadFromStorage('teleprompter-seconds', 0))
  const [speakerSpeeds, setSpeakerSpeeds] = useState(() => loadFromStorage('teleprompter-speeds', {}))
  const [speakerColors, setSpeakerColors] = useState(() => loadFromStorage('teleprompter-colors', {}))
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [showInput, setShowInput] = useState(true)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [countdown, setCountdown] = useState(null)
  const [wordPositions, setWordPositions] = useState([])
  const [pausedScrollY, setPausedScrollY] = useState(0)
  const countdownTimeoutsRef = useRef([])

  // Save to localStorage when values change
  useEffect(() => {
    localStorage.setItem('teleprompter-script', JSON.stringify(script))
  }, [script])

  useEffect(() => {
    localStorage.setItem('teleprompter-minutes', JSON.stringify(targetMinutes))
  }, [targetMinutes])

  useEffect(() => {
    localStorage.setItem('teleprompter-seconds', JSON.stringify(targetSeconds))
  }, [targetSeconds])

  useEffect(() => {
    localStorage.setItem('teleprompter-speeds', JSON.stringify(speakerSpeeds))
  }, [speakerSpeeds])

  useEffect(() => {
    localStorage.setItem('teleprompter-colors', JSON.stringify(speakerColors))
  }, [speakerColors])

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

  // Extract unique speakers
  const speakers = useMemo(() => {
    const uniqueSpeakers = []
    sectionBoundaries.forEach(s => {
      if (s.speaker && !uniqueSpeakers.includes(s.speaker)) {
        uniqueSpeakers.push(s.speaker)
      }
    })
    return uniqueSpeakers
  }, [sectionBoundaries])

  // Get speed modifier for a speaker (higher = faster = less time per word)
  const getSpeakerSpeed = (speaker) => {
    return speakerSpeeds[speaker] || 1.0
  }

  const updateSpeakerSpeed = (speaker, speed) => {
    setSpeakerSpeeds(prev => ({
      ...prev,
      [speaker]: speed
    }))
  }

  // Predefined color palette for speakers
  const colorPalette = [
    '#646cff', // Blue
    '#ff6b6b', // Red
    '#4ecdc4', // Teal
    '#ffe66d', // Yellow
    '#a855f7', // Purple
    '#f97316', // Orange
    '#22c55e', // Green
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#eab308', // Amber
  ]

  const getSpeakerColor = (speaker) => {
    if (speakerColors[speaker]) return speakerColors[speaker]
    // Assign a default color based on speaker index
    const idx = speakers.indexOf(speaker)
    return colorPalette[idx % colorPalette.length]
  }

  const updateSpeakerColor = (speaker, color) => {
    setSpeakerColors(prev => ({
      ...prev,
      [speaker]: color
    }))
  }

  const totalWords = allWords.length
  const targetTimeMs = (targetMinutes * 60 + targetSeconds) * 1000

  // Calculate timing for each word (accounting for speaker speeds)
  const wordTimings = useMemo(() => {
    const weights = allWords.map((w, i) => {
      // Check if next word starts a new line
      const isBeforeLineBreak = i < allWords.length - 1 && allWords[i + 1].isLineStart
      let weight = getWordWeight(w.text, isBeforeLineBreak)

      // Apply speaker speed modifier (higher speed = less time = divide weight)
      const speed = getSpeakerSpeed(w.speaker)
      weight = weight / speed

      return weight
    })
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    return weights.map(weight =>
      totalWeight > 0 ? (weight / totalWeight) * targetTimeMs : 0
    )
  }, [allWords, targetTimeMs, speakerSpeeds])

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
  const pausedViewportRef = useRef(null)

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

    // Update elapsed time display (always keep running)
    setElapsedTime(elapsed)

    // Determine current word from elapsed time (cap at last word)
    const wordIdx = Math.min(getWordIndexAtTime(elapsed), allWords.length - 1)
    setCurrentWordIndex(wordIdx)

    // Calculate and apply scroll position (cap at final position)
    const cappedElapsed = Math.min(elapsed, targetTimeMs)
    const scrollY = getScrollPositionAtTime(cappedElapsed, positions)
    scrollContentRef.current.style.transform = `translateY(${-scrollY}px)`

    // Keep animation running to show elapsed time
    animationRef.current = requestAnimationFrame(runAnimation)
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

  const cancelCountdown = () => {
    countdownTimeoutsRef.current.forEach(id => clearTimeout(id))
    countdownTimeoutsRef.current = []
    setCountdown(null)
  }

  const handlePause = () => {
    // Cancel any ongoing countdown
    cancelCountdown()

    // Save current scroll position before pausing
    if (scrollContentRef.current) {
      const transform = scrollContentRef.current.style.transform
      const match = transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/)
      if (match) {
        setPausedScrollY(Math.abs(parseFloat(match[1])))
      }
    }
    setIsPlaying(false)
    stopAnimation()
  }

  const handleResume = () => {
    if (currentWordIndex >= 0) {
      // Clear any existing timeouts
      cancelCountdown()

      // Show countdown before resuming
      setCountdown(3)

      // After state updates and DOM re-renders, set the scroll position
      const scrollTimeout = setTimeout(() => {
        if (scrollContentRef.current) {
          scrollContentRef.current.style.transform = `translateY(${-pausedScrollY}px)`
        }
      }, 50)

      const t1 = setTimeout(() => setCountdown(2), 1000)
      const t2 = setTimeout(() => setCountdown(1), 2000)
      const t3 = setTimeout(() => {
        setCountdown(null)

        // Adjust start time to account for elapsed time
        startTimeRef.current = Date.now() - elapsedTime

        // Re-measure positions and snap back to correct scroll position
        requestAnimationFrame(() => {
          const positions = measureWordPositions()
          setWordPositions(positions)

          // Reset scroll position based on elapsed time
          if (scrollContentRef.current && positions.length > 0) {
            const scrollY = getScrollPositionAtTime(elapsedTime, positions)
            scrollContentRef.current.style.transform = `translateY(${-scrollY}px)`
          }

          setIsPlaying(true)
        })
      }, 3000)

      countdownTimeoutsRef.current = [scrollTimeout, t1, t2, t3]
    }
  }

  const handleRestart = () => {
    // Clear any existing timeouts
    cancelCountdown()
    stopAnimation()
    setIsPlaying(false)
    setCurrentWordIndex(0)
    setElapsedTime(0)
    setPausedScrollY(0)

    if (scrollContentRef.current) {
      scrollContentRef.current.style.transform = 'translateY(0)'
    }

    // Show countdown before restarting
    setCountdown(3)

    const t1 = setTimeout(() => setCountdown(2), 1000)
    const t2 = setTimeout(() => setCountdown(1), 2000)
    const t3 = setTimeout(() => {
      setCountdown(null)
      startTimeRef.current = Date.now()

      // Re-measure and start
      requestAnimationFrame(() => {
        const positions = measureWordPositions()
        setWordPositions(positions)
        setIsPlaying(true)
      })
    }, 3000)

    countdownTimeoutsRef.current = [t1, t2, t3]
  }

  const handleExit = () => {
    setIsPlaying(false)
    setCurrentWordIndex(-1)
    setElapsedTime(0)
    setShowInput(true)
    setWordPositions([])
    setPausedScrollY(0)
    stopAnimation()
    startTimeRef.current = null

    if (scrollContentRef.current) {
      scrollContentRef.current.style.transform = 'translateY(0)'
    }
  }

  // Esc key to go back to input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !showInput) {
        handleExit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showInput])

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Render words grouped by section
  const renderWords = () => {
    const elements = []

    sectionBoundaries.forEach((section, sectionIdx) => {
      const speakerColor = section.speaker ? getSpeakerColor(section.speaker) : '#646cff'

      // Add speaker divider
      if (sectionIdx > 0 && section.speaker) {
        elements.push(
          <div key={`divider-${sectionIdx}`} className="speaker-divider">
            <span className="speaker-name" style={{ color: speakerColor }}>{section.speaker}</span>
          </div>
        )
      }

      if (sectionIdx === 0 && section.speaker) {
        elements.push(
          <div key={`speaker-${sectionIdx}`} className="speaker-divider first">
            <span className="speaker-name" style={{ color: speakerColor }}>{section.speaker}</span>
          </div>
        )
      }

      const sectionWords = []
      for (let i = section.startIndex; i <= section.endIndex; i++) {
        const word = allWords[i]
        const isCurrent = i === currentWordIndex
        const isPast = i < currentWordIndex

        const wordStyle = isCurrent ? { backgroundColor: speakerColor } : {}

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
              style={wordStyle}
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
          <div className="sidebar">
            <ScrollArea.Root className="scroll-area-root sidebar-scroll">
              <ScrollArea.Viewport className="scroll-area-viewport">
                <div className="sidebar-content">
                  <h1>Teleprompter</h1>

                  <div className="stats">
                    <span>Words: {totalWords}</span>
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

                  {speakers.length > 0 && (
                    <div className="speaker-settings">
                      <label>Speakers:</label>
                      <div className="speaker-controls">
                        {speakers.map(speaker => (
                          <div key={speaker} className="speaker-control">
                            <div className="speaker-control-header">
                              <Popover.Root>
                                <Popover.Trigger asChild>
                                  <button
                                    className="color-trigger"
                                    style={{ backgroundColor: getSpeakerColor(speaker) }}
                                    title="Choose color"
                                  />
                                </Popover.Trigger>
                                <Popover.Portal>
                                  <Popover.Content className="color-popover" sideOffset={5}>
                                    <div className="color-swatches">
                                      {colorPalette.map(color => (
                                        <Popover.Close asChild key={color}>
                                          <button
                                            className={`color-swatch ${getSpeakerColor(speaker) === color ? 'selected' : ''}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => updateSpeakerColor(speaker, color)}
                                          />
                                        </Popover.Close>
                                      ))}
                                    </div>
                                    <Popover.Arrow className="color-popover-arrow" />
                                  </Popover.Content>
                                </Popover.Portal>
                              </Popover.Root>
                              <span className="speed-speaker-name" style={{ color: getSpeakerColor(speaker) }}>
                                {speaker}
                              </span>
                            </div>
                            <div className="speaker-control-slider">
                              <span className="speed-label">Speed</span>
                              <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.01"
                                value={getSpeakerSpeed(speaker)}
                                onChange={(e) => updateSpeakerSpeed(speaker, parseFloat(e.target.value))}
                              />
                              <span className="speed-value">{getSpeakerSpeed(speaker).toFixed(2)}x</span>
                            </div>
                          </div>
                        ))}
                      </div>
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
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="scroll-area-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="scroll-area-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </div>

          <div className="editor-panel">
            <ScrollArea.Root className="scroll-area-root">
              <ScrollArea.Viewport className="scroll-area-viewport">
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
                />
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="scroll-area-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="scroll-area-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </div>
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
              {isPlaying || countdown !== null ? (
                <button onClick={handlePause} title="Pause">
                  <Pause size={16} />
                </button>
              ) : (
                <button onClick={handleResume} title="Resume">
                  <Play size={16} />
                </button>
              )}
              <button onClick={handleRestart} title="Restart">
                <RotateCcw size={16} />
              </button>
              <button onClick={handleExit} className="exit-btn" title="Exit (Esc)">
                <X size={16} />
              </button>
            </div>
          </div>

          {isPlaying || countdown !== null ? (
            <div className="word-display playing" ref={wordDisplayRef}>
              <div className="scroll-content" ref={scrollContentRef}>
                {renderWords()}
              </div>
            </div>
          ) : (
            <ScrollArea.Root className="scroll-area-root word-display-scroll">
              <ScrollArea.Viewport
                className="scroll-area-viewport word-display paused"
                ref={(el) => {
                  wordDisplayRef.current = el
                  pausedViewportRef.current = el
                  // Scroll to saved position when viewport mounts
                  if (el && pausedScrollY > 0) {
                    el.scrollTop = pausedScrollY
                  }
                }}
              >
                <div className="scroll-content" ref={scrollContentRef}>
                  {renderWords()}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="scroll-area-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="scroll-area-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          )}
        </div>
      )}
    </div>
  )
}

export default App
