# ThermalNotes

A **simple** and **elegant** desktop application for printing notes to Epson TM-M30III thermal printers over Bluetooth and network connections.

## Summary

ThermalNotes is an **Electron-based** application that provides a streamlined interface for creating and printing formatted text to thermal printers. The app features a **real-time** preview of how your notes will appear on the thermal printer, with automatic text wrapping and formatting options.

### Key Features

- **📝 Rich Text Editing**: Bold, underline, and font size formatting
- **🖨️ Thermal Printer Support**: Optimized for Epson TM-M30III printers
- **🔄 Auto-Detection**: Automatically finds and connects to network printers
- **📐 Smart Formatting**: Character-per-line calculations for accurate output
- **💾 Persistent Settings**: Remembers your preferences between sessions
- **⚡ Real-time Preview**: See exactly how your notes will print

## Installation

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Epson TM-M30III** thermal printer (connected via network or Bluetooth)

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
   This will start both the Vite development server and Electron application.

4. **Build for production**:
   ```bash
   npm run build
   ```
   This creates a distributable `.dmg` file for macOS.

## Usage

### Getting Started

1. **Launch** the application
2. The app will **automatically scan** for Epson thermal printers on your network
3. Once connected, the printer status indicator will show **green**
4. Start typing your notes in the editor
5. Use the **formatting toolbar** to style your text
6. Press **Print** to send your notes to the thermal printer

### Keyboard Shortcuts

- **Cmd/Ctrl + B**: Toggle bold formatting
- **Cmd/Ctrl + U**: Toggle underline formatting
- **Cmd/Ctrl + P**: Print current note
- **Cmd/Ctrl + Enter**: Quick print
- **Cmd/Ctrl + 1/2/3**: Change font size (Small/Medium/Large)

### Formatting Options

- **Font Sizes**: Small (20pt), Medium (28pt), Large (40pt)
- **Text Alignment**: Left, Center, Right
- **Word Wrapping**: Automatic text wrapping based on printer width
- **Text Formatting**: Bold and underline support

## Configuration

### Printer Setup

The application supports **two connection methods**:

1. **Automatic Network Detection**: The app scans common IP ranges for Epson printers
2. **Manual IP Configuration**: Click the printer status indicator to manually enter an IP address

### Settings Storage

User preferences are **automatically saved** including:
- Font size preferences
- Text alignment settings
- Word wrap preferences
- Note background color
- Printer IP address

## Technical Details

### Architecture

- **Frontend**: React 18 with Vite
- **Backend**: Electron with Node.js
- **Printer Communication**: ESC/POS protocol via `escpos` library
- **Settings Storage**: `electron-store` for persistent configuration

### Supported Printers

- **Primary**: Epson TM-M30III
- **Protocol**: ESC/POS compatible thermal printers
- **Connection**: Network (TCP/IP) and Serial/Bluetooth

## TODO

- [ ] **Bold/underline specific words**: Implement inline formatting for individual words within paragraphs
- [ ] **Image based printing**: Add support for printing images and logos alongside text
- [ ] **Custom fonts**: Allow users to select and install custom fonts for printing
- [ ] **Fix placeholder**: Improve the editor placeholder text and initial state handling
- [ ] **Dedicated title section**: Create a separate title input field with larger font formatting
- [ ] **Print history**: Keep a log of previously printed notes

## Troubleshooting

### Common Issues

**Printer Not Found**:
- Ensure your printer is **connected** to the same network
- Check that the printer's **IP address** is accessible
- Try **manually entering** the printer's IP address

**Formatting Issues**:
- Different font sizes have different **character limits** per line
- The app **automatically calculates** text wrapping based on font size
- Use the **preview** to check formatting before printing

**Connection Problems**:
- Restart both the **application** and **printer**
- Check **network connectivity**
- Verify printer is in **ready state** (not in error mode)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with actual thermal printer
5. Submit a pull request
