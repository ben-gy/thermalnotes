# ThermalNotes

> **⚠️ AI-Generated Code Notice**: This entire application has been written by AI without human supervision. While functional, the code may contain unexpected behaviors, security vulnerabilities, or design patterns that differ from human-written software. Use at your own discretion.

A **sophisticated** desktop application for printing formatted notes to Epson TM-M30III thermal printers over network and serial connections.

## Summary

ThermalNotes is an **Electron-based** application that provides an intelligent, auto-resizing interface for creating and printing rich-text notes to thermal printers. The app features **real-time text wrapping simulation**, **advanced formatting options**, and **automatic printer detection** with persistent settings.

### Key Features

- **🖨️ Smart Printer Detection**: Automatically scans your network for Epson TM-M30III printers
- **⚙️ Intelligent Text Wrapping**: Real-time preview with character-per-line calculations
- **🔄 Word Wrap Toggle**: Choose between word-preserving or character-breaking line wrapping
- **💾 Persistent Settings**: Remembers all preferences between sessions
- **🌈 Visual Themes**: White or yellow sticky note backgrounds
- **⌨️ Extensive Keyboard Shortcuts**: Full keyboard control for power users
- **🔄 Last Print Restore**: Quickly restore your most recently printed text

## Installation

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Epson TM-M30III** thermal printer (network or serial connection)

### Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd thermalnotes
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Development mode**:
   ```bash
   npm run dev
   ```
   This starts both the Vite development server and Electron application.

4. **Build for production**:
   ```bash
   npm run build
   ```
   Creates a distributable `.dmg` file for macOS.

## Usage

### Getting Started

1. **Launch** the application - it opens as a compact, auto-resizing window
2. The app **automatically scans** your network for Epson thermal printers
3. If no printer is found, click the red ❌ icon to scan again or **Shift+Click** to manually enter an IP address
4. Start typing in the editor - the window grows automatically to fit your content
5. Use formatting tools or keyboard shortcuts to style your text
6. **Press Enter** to print (or **Shift+Enter** to create new paragraph, depending on your settings)

### Formatting Features

#### Font Sizes
- **Small (20pt)**: ~24 characters per line
- **Medium (28pt)**: ~17 characters per line  
- **Large (40pt)**: ~12 characters per line

#### Text Formatting
- **Alignment**: Left, Center, Right for entire document
- **Word Wrap**: Toggle between word-preserving and character-breaking
- **First Uppercase**: Automatically uppercase the whole first line when printing

#### Advanced Options
- **Enter Key Behavior**: Toggle between "Enter prints" vs "Enter creates new paragraph"
- **Color Themes**: Switch between white and yellow sticky note backgrounds
- **Auto-Sizing**: Window automatically adjusts to content height

### Keyboard Shortcuts

#### Formatting
- **Cmd/Ctrl + B**: Toggle bold formatting (selected text)
- **Cmd/Ctrl + U**: Toggle underline formatting (selected text)
- **Cmd/Ctrl + 1/2/3**: Change font size to Small/Medium/Large

#### Alignment
- **Cmd/Ctrl + Shift + L**: Align left
- **Cmd/Ctrl + Shift + E**: Align center
- **Cmd/Ctrl + Shift + R**: Align right

#### Printing
- **Enter**: Print (or new paragraph, depending on settings)
- **Shift/Cmd/Ctrl + Enter**: New paragraph (or print, depending on settings)

### Printer Setup

#### Automatic Detection
The app scans common IP address ranges to find your printer:
- **Quick Scan**: Tests common printer IP addresses (100-110, 180-190, 200-240 ranges)
- **Full Scan**: If quick scan fails, automatically scans entire subnet (2-254)
- **Persistent Connection**: Remembers successful connections between sessions

#### Manual Configuration
- **Click** the printer status icon to start scanning
- **Shift+Click** the printer status icon to manually enter an IP address
- Supports both **network (TCP/IP)** and **serial** connections

## Technical Details

### Architecture

- **Frontend**: React 18 with Vite - contenteditable rich text editor
- **Backend**: Electron with Node.js - printer communication and window management
- **Printer Protocol**: ESC/POS via `escpos` library with network and serial adapters
- **Settings**: `electron-store` for persistent configuration
- **UI**: React Icons for toolbar elements

### Auto-Resizing Window

The application dynamically calculates window height based on:
- Content height in the editor
- Fixed UI elements (toolbar, padding, margins)
- Font size changes
- Real-time content updates

### Printer Communication

- **Network**: TCP/IP connection on port 9100 (standard for Epson printers)
- **Serial**: Serial port communication with configurable baud rates
- **Format Translation**: Converts rich text to ESC/POS commands
- **Character Mapping**: Precise character-per-line calculations for accurate wrapping

### Smart Text Wrapping

The app simulates actual printer output by:
- Calculating exact character limits per font size
- Offering word-preserving or character-breaking wrap modes
- Handling long words that exceed line width
- Preserving manual line breaks and paragraphs

## Settings & Persistence

All preferences are automatically saved:
- Font size and alignment preferences
- Word wrap and enter key behavior
- Color theme selection
- Printer IP address and connection settings
- Window size and position

## Troubleshooting

### Printer Connection Issues

**Red ❌ Icon (Disconnected)**:
- Click to start automatic network scan
- Shift+Click to manually enter IP address
- Ensure printer is on same network and accessible

**Scanning Animation**:
- App is actively looking for printers
- Quick scan typically completes in 2-5 seconds
- Full scan may take 10-30 seconds depending on network size

**Connection Persistence**:
- App remembers successful connections
- Automatically reconnects on startup
- Clears saved connection if printer IP changes

### Formatting Issues

**Text Wrapping**:
- Character limits are calibrated for actual printer output
- Toggle word wrap mode if text breaks awkwardly
- Use print preview to check formatting before printing

**Window Sizing**:
- Window automatically resizes to fit content
- Fixed width (332px) optimized for thermal printer output
- Height adjusts dynamically based on content

### Performance

**Network Scanning**:
- Scans 50 IP addresses simultaneously for speed
- Shorter timeouts (500ms) for faster results
- Prioritizes common printer IP ranges

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test with actual Epson TM-M30III printer
4. Verify auto-resizing and formatting work correctly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*This application demonstrates AI-generated code capabilities but should be thoroughly tested before production use.*
