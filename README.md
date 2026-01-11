# Teleprompter

A simple, customizable teleprompter app built with React and Vite. Paste your script, set a target reading time, and the app will scroll through your words at the calculated pace.

## Features

- **Target Time-Based Pacing**: Set how long you want your script to take, and the app calculates the required words-per-minute
- **Dynamic Word Timing**: Longer words and multi-syllable words get proportionally more time
- **Punctuation Pauses**: Automatic pauses after periods, commas, and other punctuation
- **Multi-Speaker Support**: Mark different speakers with `[Speaker]:` syntax
- **Per-Speaker Customization**: Set unique colors and speaking speeds for each speaker
- **Smooth Scrolling**: Continuous, synchronized scrolling that keeps the current word centered
- **Countdown Timer**: 3-2-1 countdown before starting or resuming
- **Pause/Resume**: Pause anytime and scroll through the script manually
- **Persistent Settings**: Script, timing, and speaker settings are saved to localStorage

## Script Syntax

```
[Kevin]:
Hey, my name is Kevin. I'm the CEO of the company.

[Mark]:
And I'm Mark, the CTO.

[Kevin]:
Together, we're building something great.
```

- Use `[SpeakerName]:` to mark speaker sections
- Line breaks within a section are preserved
- `==highlighted text==` markers are automatically stripped
- **bold** and *italic* markdown is supported

## Usage

1. Paste your script in the editor
2. Set your target reading time (minutes and seconds)
3. Adjust speaker colors and speeds if needed
4. Click "Start Teleprompter"
5. Use the controls to pause, resume, restart, or exit

### Keyboard Shortcuts

- **Esc**: Exit back to the editor

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- React
- Vite
- Radix UI (ScrollArea, Popover)
- Lucide React (icons)
