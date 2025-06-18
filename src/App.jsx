import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCircle, FiPlus, FiMinus, FiCheck, FiX, FiLoader, FiAlignLeft, FiAlignCenter, FiAlignRight, FiBold, FiUnderline, FiType } from 'react-icons/fi';
import { MdFormatSize } from 'react-icons/md';
import { AiOutlineFontSize } from 'react-icons/ai';
import { FaCircle } from 'react-icons/fa';
import './index.css';

// Custom font size icon component
const FontSizeIcon = ({ size }) => {
  const sizeMap = {
    tiny: 8,
    small: 10,
    regular: 12,
    large: 14,
    xlarge: 16
  };
  
  return (
    <span style={{ fontSize: `${sizeMap[size]}px`, fontWeight: 'bold', fontFamily: 'Arial' }}>
      T
    </span>
  );
};

// Tooltip component for keyboard shortcuts
const Tooltip = ({ shortcut, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef(null);
  
  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 1000); // Show after 1 second
  };
  
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };
  
  return (
    <div className="tooltip-wrapper" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {showTooltip && (
        <div className="tooltip">
          {shortcut}
        </div>
      )}
    </div>
  );
};

function App() {
  // Font size presets - defined first to avoid initialization errors
  const FONT_SIZES = [16, 20, 28, 36, 48]; // tiny, small, regular, large, xlarge
  const DEFAULT_FONT_SIZE_INDEX = 2; // regular (28pt)
  
  const [note, setNote] = useState('');
  const [rawText, setRawText] = useState(''); // Store original text for printing
  const [lastPrintedText, setLastPrintedText] = useState('');
  const [lastPrintedFontSizeIndex, setLastPrintedFontSizeIndex] = useState(DEFAULT_FONT_SIZE_INDEX);
  const [noteColor, setNoteColor] = useState(() => {
    return localStorage.getItem('noteColor') || 'white';
  });
  
  const [fontSizeIndex, setFontSizeIndex] = useState(() => {
    const saved = localStorage.getItem('fontSizeIndex');
    return saved ? parseInt(saved) : DEFAULT_FONT_SIZE_INDEX;
  });
  const fontSize = FONT_SIZES[fontSizeIndex];
  const [textAlign, setTextAlign] = useState(() => {
    return localStorage.getItem('textAlign') || 'center';
  });
  // Note: Bold and underline currently apply to all text. 
  // To support selection-based formatting, we'd need to switch from <textarea> to contenteditable or a rich text editor
  const [isBold, setIsBold] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [ipInput, setIpInput] = useState('');
  const previewRef = useRef(null);

  // Auto-resize textarea height based on content
  const adjustTextareaHeight = () => {
    if (previewRef.current) {
      // Reset height to get accurate scrollHeight
      previewRef.current.style.height = 'auto';
      const scrollHeight = previewRef.current.scrollHeight;
      previewRef.current.style.height = scrollHeight + 'px';
      
      // Resize window to fit exactly
      const total = 60 + scrollHeight; // 30px top padding + content + 30px bottom padding
      window.api.resizeWindow(total);
    }
  };

  // Resize window to fit content
  useEffect(() => {
    setTimeout(() => {
      if (previewRef.current) {
        adjustTextareaHeight();
      }
    }, 0);
  }, [note, fontSize]);

  // Focus on load
  useEffect(() => {
    setTimeout(() => {
      if (previewRef.current) {
        previewRef.current.focus();
        adjustTextareaHeight();
      }
    }, 50);
  }, []);

  // Update body background to match sticky colour
  useEffect(() => {
    document.body.style.background = noteColor === 'yellow' ? '#fff9c4' : '#ffffff';
  }, [noteColor]);

  // Save color preference to localStorage
  useEffect(() => {
    localStorage.setItem('noteColor', noteColor);
  }, [noteColor]);

  // Save font size preference to localStorage
  useEffect(() => {
    localStorage.setItem('fontSizeIndex', fontSizeIndex.toString());
  }, [fontSizeIndex]);

  // Save text alignment preference to localStorage
  useEffect(() => {
    localStorage.setItem('textAlign', textAlign);
  }, [textAlign]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcut = (e) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      const isCtrlCmd = e.metaKey || e.ctrlKey;
      
      if (isCtrlCmd) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            setIsBold(!isBold);
            break;
          case 'u':
            e.preventDefault();
            setIsUnderline(!isUnderline);
            break;
          case '-':
          case '_':
            e.preventDefault();
            setFontSizeIndex(prev => Math.max(0, prev - 1));
            break;
          case '+':
          case '=':
            e.preventDefault();
            setFontSizeIndex(prev => Math.min(FONT_SIZES.length - 1, prev + 1));
            break;
          case 'l':
            if (e.shiftKey) {
              e.preventDefault();
              setTextAlign('left');
            }
            break;
          case 'e':
            if (e.shiftKey) {
              e.preventDefault();
              setTextAlign('center');
            }
            break;
          case 'r':
            if (e.shiftKey) {
              e.preventDefault();
              setTextAlign('right');
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [isBold, isUnderline, fontSizeIndex]);

  // Initialize printer status and set up listeners
  useEffect(() => {
    console.log('[UI] Initializing printer status...');
    // Get initial printer status
    window.api.getPrinterStatus().then((status) => {
      console.log('[UI] Initial printer status:', status);
      setPrinterConnected(status);
    });

    // Listen for printer status changes
    const handleStatusChange = (event, connected) => {
      console.log('[UI] Printer status changed:', connected);
      setPrinterConnected(connected);
      if (connected !== 'scanning') {
        setPrinterScanning(false);
      }
    };

    // Listen for scanning status changes
    const handleScanningChange = (event, scanning) => {
      console.log('[UI] Printer scanning status:', scanning);
      setPrinterScanning(scanning);
    };

    window.api.onPrinterStatusChanged(handleStatusChange);
    window.api.onPrinterScanningChanged(handleScanningChange);

    // Cleanup listener on unmount
    return () => {
      window.api.offPrinterStatusChanged(handleStatusChange);
      window.api.offPrinterScanningChanged(handleScanningChange);
    };
  }, []);

  // Get characters per line based on font size for EPSON TM-m30III
  // These values are based on actual testing with different escpos size multipliers
  const getCharsPerLine = (fontSizePt) => {
    // Matches the escpos size() we send to printer
    if (fontSizePt >= 48) return 10;      // X-Large: size(3,3) = ~10 chars  
    else if (fontSizePt >= 36) return 16; // Large: size(2,2) = 16 chars
    else if (fontSizePt >= 28) return 20; // Regular: size(2,2) = ~20 chars
    else if (fontSizePt >= 20) return 32; // Small: size(1,1) = ~32 chars
    else return 40;                        // Tiny: size(1,1) = ~40 chars
  };

  const simulatePrinterWrapping = (text, fontSizePt) => {
    const charsPerLine = getCharsPerLine(fontSizePt);
    
    // Split text by manual line breaks first
    const lines = text.split('\n');
    const wrappedLines = [];
    
    // Process each line separately
    for (const line of lines) {
      if (line.length === 0) {
        // Preserve empty lines
        wrappedLines.push('');
      } else if (line.length <= charsPerLine) {
        // Line fits, add as-is
        wrappedLines.push(line);
      } else {
        // Line needs wrapping
        for (let i = 0; i < line.length; i += charsPerLine) {
          wrappedLines.push(line.slice(i, i + charsPerLine));
        }
      }
    }
    
    return wrappedLines.join('\n');
  };

  const handleChange = (e) => {
    const input = e.target.value;
    setRawText(input); // Store raw input for printing
    const wrappedText = simulatePrinterWrapping(input, fontSize);
    setNote(wrappedText); // Display wrapped version
    setTimeout(adjustTextareaHeight, 0); // Adjust height after state update
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: Insert new line
        e.preventDefault();
        const textarea = e.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = rawText.substring(0, start) + '\n' + rawText.substring(end);
        setRawText(newText);
        setNote(simulatePrinterWrapping(newText, fontSize));
        // Set cursor position after the new line
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          adjustTextareaHeight();
        }, 0);
      } else {
        // Enter only: Print
        e.preventDefault();
        if (rawText.trim()) {
          setLastPrintedText(rawText.trim());
          setLastPrintedFontSizeIndex(fontSizeIndex);
          window.api.print(rawText.trim(), textAlign, fontSize, isBold, isUnderline);
          setNote('');
          setRawText('');
          setTimeout(adjustTextareaHeight, 0);
        }
      }
    }
  };

  const toggleColor = () => {
    setNoteColor(noteColor === 'white' ? 'yellow' : 'white');
  };

  const handlePrinterStatusClick = async () => {
    console.log('[UI] Printer status clicked, connected:', printerConnected);
    if (!printerConnected && !printerScanning) {
      console.log('[UI] Starting network scan...');
      setPrinterScanning(true);
      
      try {
        // Try to scan for network printers
        const foundPrinters = await window.api.scanNetworkPrinters();
        console.log('[UI] Network scan result:', foundPrinters);
        
        if (foundPrinters.length > 0) {
          // Use the first found printer
          console.log('[UI] Using first found printer:', foundPrinters[0]);
          await window.api.setPrinterIP(foundPrinters[0]);
          console.log('[UI] Printer IP set, refreshing status...');
          // Refresh status
          await window.api.refreshPrinterStatus();
        } else {
          console.log('[UI] No printers found, showing manual input dialog');
          setPrinterScanning(false);
          // Show IP input dialog
          setShowIPDialog(true);
        }
      } catch (error) {
        console.error('[UI] Scan failed:', error);
        setPrinterScanning(false);
      }
    }
  };

  const handleIPSubmit = async () => {
    console.log('[UI] IP submit clicked, input:', ipInput);
    if (ipInput && /^\d+\.\d+\.\d+\.\d+$/.test(ipInput)) {
      console.log('[UI] Valid IP format, setting printer IP...');
      await window.api.setPrinterIP(ipInput);
      console.log('[UI] Manually set printer IP:', ipInput);
      setShowIPDialog(false);
      setIpInput('');
      console.log('[UI] Refreshing printer status...');
      // Refresh status
      const newStatus = await window.api.refreshPrinterStatus();
      console.log('[UI] New printer status after manual IP:', newStatus);
    } else {
      console.log('[UI] Invalid IP format:', ipInput);
    }
  };

  const handleIPCancel = () => {
    setShowIPDialog(false);
    setIpInput('');
  };

  return (
    <div 
      className="sticky-root" 
      style={{ background: noteColor === 'yellow' ? '#fff9c4' : '#fff' }}
    >
      <div className="printer-status" onClick={handlePrinterStatusClick}>
        {printerConnected ? (
          <FiCheck className="printer-status-icon connected" title="Printer connected" />
        ) : printerScanning ? (
          <FiLoader className="printer-status-icon scanning" title="Scanning for printer..." />
        ) : (
          <FiX className="printer-status-icon disconnected" title="Click to scan for printer" />
        )}
      </div>

      <textarea
        className="note-area"
        ref={previewRef}
        style={{ 
          fontSize: `${fontSize}pt`, 
          textAlign,
          fontWeight: isBold ? 'bold' : 'normal',
          textDecoration: isUnderline ? 'underline' : 'none'
        }}
        value={note}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="TYPE HERE"
      />

      <button 
        className="color-toggle-btn" 
        onClick={toggleColor}
        title={`Switch to ${noteColor === 'white' ? 'yellow' : 'white'} sticky note`}
      >
        {noteColor === 'white' ? (
          <FiCircle size={18} />
        ) : (
          <FaCircle size={18} />
        )}
      </button>

      <div className="font-controls">
        {/* Font size controls */}
        <Tooltip shortcut="⌘-">
          <button
            className={`font-size-btn ${fontSizeIndex === 0 ? 'disabled' : ''}`}
            onClick={() => setFontSizeIndex(prev => Math.max(0, prev - 1))}
            disabled={fontSizeIndex === 0}
            title="Decrease font size"
          >
            <FiMinus size={14} />
          </button>
        </Tooltip>
        
        <button
          className="font-size-display"
          title={`Font size: ${fontSize}pt`}
          disabled
        >
          <span style={{ 
            fontSize: `${Math.min(20, fontSize / 2)}px`, 
            fontWeight: 'bold',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
          }}>
            T
          </span>
        </button>
        
        <Tooltip shortcut="⌘+">
          <button
            className={`font-size-btn ${fontSizeIndex === FONT_SIZES.length - 1 ? 'disabled' : ''}`}
            onClick={() => setFontSizeIndex(prev => Math.min(FONT_SIZES.length - 1, prev + 1))}
            disabled={fontSizeIndex === FONT_SIZES.length - 1}
            title="Increase font size"
          >
            <FiPlus size={14} />
          </button>
        </Tooltip>
        
        <div className="alignment-divider" />
        
        {/* Bold and Underline */}
        <Tooltip shortcut="⌘B">
          <button 
            className={`format-btn ${isBold ? 'active' : ''}`}
            onClick={() => setIsBold(!isBold)}
            title="Bold"
          >
            <FiBold size={14} />
          </button>
        </Tooltip>
        <Tooltip shortcut="⌘U">
          <button 
            className={`format-btn ${isUnderline ? 'active' : ''}`}
            onClick={() => setIsUnderline(!isUnderline)}
            title="Underline"
          >
            <FiUnderline size={14} />
          </button>
        </Tooltip>
        
        <div className="alignment-divider" />
        
        {/* Alignment buttons */}
        <Tooltip shortcut="⌘⇧L">
          <button 
            className={`align-btn ${textAlign === 'left' ? 'active' : ''}`}
            onClick={() => setTextAlign('left')}
            title="Align left"
          >
            <FiAlignLeft size={14} />
          </button>
        </Tooltip>
        <Tooltip shortcut="⌘⇧E">
          <button 
            className={`align-btn ${textAlign === 'center' ? 'active' : ''}`}
            onClick={() => setTextAlign('center')}
            title="Align center"
          >
            <FiAlignCenter size={14} />
          </button>
        </Tooltip>
        <Tooltip shortcut="⌘⇧R">
          <button 
            className={`align-btn ${textAlign === 'right' ? 'active' : ''}`}
            onClick={() => setTextAlign('right')}
            title="Align right"
          >
            <FiAlignRight size={14} />
          </button>
        </Tooltip>
      </div>

      {lastPrintedText && (
        <button 
          className="refresh-btn" 
          onClick={() => {
            setRawText(lastPrintedText);
            const lastFontSize = FONT_SIZES[lastPrintedFontSizeIndex];
            setNote(simulatePrinterWrapping(lastPrintedText, lastFontSize));
          }}
          title="Restore last printed text"
        >
          <FiRefreshCw size={16} />
        </button>
      )}

      {showIPDialog && (
        <div className="ip-dialog-overlay">
          <div className="ip-dialog">
            <h3>Enter Printer IP Address</h3>
            <p>Enter your EPSON TM-m30III IP address:</p>
            <input
              type="text"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIPSubmit()}
              placeholder="192.168.1.100"
              className="ip-input"
              autoFocus
            />
            <div className="ip-dialog-buttons">
              <button onClick={handleIPCancel} className="ip-btn cancel">
                Cancel
              </button>
              <button onClick={handleIPSubmit} className="ip-btn submit">
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 