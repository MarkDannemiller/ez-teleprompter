# Teleprompter

A simple, customizable teleprompter app built with React and Vite. Paste your script, set a target reading time, and the app will scroll through your words at the calculated pace. Kevin and I worked on this app because we needed to do a video with a script that needed to be said in exactly one minute. We couldn't find a teleprompter app out there that allowed you to set the exact time that you needed to say the script within. 

<img width="2554" height="1330" alt="image" src="https://github.com/user-attachments/assets/e80d6526-89c6-444c-94f9-02b83b79e361" />


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

<img width="2518" height="1314" alt="image" src="https://github.com/user-attachments/assets/b38a56a9-79ec-4234-8398-73dd403cc621" />

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
