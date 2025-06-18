import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCircle, FiPlus, FiMinus, FiCheck, FiX, FiLoader, FiAlignLeft, FiAlignCenter, FiAlignRight } from 'react-icons/fi';
import { FaCircle } from 'react-icons/fa';
import './index.css';

function App() {
  const [note, setNote] = useState('');
  const [rawText, setRawText] = useState(''); // Store original text for printing
  const [lastPrintedText, setLastPrintedText] = useState('');
  const [noteColor, setNoteColor] = useState(() => {
    return localStorage.getItem('noteColor') || 'white';
  });
  const [fontSize, setFontSize] = useState(() => {
    return parseInt(localStorage.getItem('fontSize')) || 30;
  });
  const [textAlign, setTextAlign] = useState(() => {
    return localStorage.getItem('textAlign') || 'center';
  });
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
    localStorage.setItem('fontSize', fontSize.toString());
  }, [fontSize]);

  // Save text alignment preference to localStorage
  useEffect(() => {
    localStorage.setItem('textAlign', textAlign);
  }, [textAlign]);

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
  // These values are based on EPSON specifications and your actual test
  const getCharsPerLine = (fontSizePt) => {
    // At size(2,2) in escpos, different font sizes give different character counts
    if (fontSizePt >= 32) return 16;      // 32pt and above = 16 chars (verified by your test)
    else if (fontSizePt >= 28) return 18; // 28-31pt = ~18 chars
    else if (fontSizePt >= 24) return 20; // 24-27pt = ~20 chars
    else if (fontSizePt >= 20) return 24; // 20-23pt = ~24 chars
    else return 30;                       // 16-19pt = ~30 chars
  };

  const simulatePrinterWrapping = (text, fontSizePt) => {
    const charsPerLine = getCharsPerLine(fontSizePt);
    
    // Process the text to match exactly how the thermal printer will wrap it
    const result = [];
    let currentLine = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (char === '\n') {
        // Manual line break - add current line and start new one
        result.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= charsPerLine) {
        // Line is full - wrap to next line
        result.push(currentLine);
        currentLine = char;
      } else {
        // Add character to current line
        currentLine += char;
      }
    }
    
    // Add the last line if it has content
    if (currentLine.length > 0) {
      result.push(currentLine);
    }
    
    return result.join('\n');
  };

  const handleChange = (e) => {
    const input = e.target.value;
    setRawText(input); // Store raw input for printing
    const wrappedText = simulatePrinterWrapping(input, fontSize);
    setNote(wrappedText); // Display wrapped version
    setTimeout(adjustTextareaHeight, 0); // Adjust height after state update
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (rawText.trim()) {
        setLastPrintedText(rawText.trim());
        window.api.print(rawText.trim(), textAlign); // Send text and alignment to printer
        setNote('');
        setRawText('');
        setTimeout(adjustTextareaHeight, 0);
      }
    }
  };

  const toggleColor = () => {
    setNoteColor(noteColor === 'white' ? 'yellow' : 'white');
  };

  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 2, 60)); // Max 60pt
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 2, 16)); // Min 16pt
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
        style={{ fontSize: `${fontSize}pt`, textAlign }}
        value={note}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Your text…"
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
        <button 
          className="font-btn" 
          onClick={decreaseFontSize}
          title="Decrease font size"
        >
          <FiMinus size={14} />
        </button>
        <span className="font-size-display">{fontSize}pt</span>
        <button 
          className="font-btn" 
          onClick={increaseFontSize}
          title="Increase font size"
        >
          <FiPlus size={14} />
        </button>
        
        <div className="alignment-divider" />
        
        <button 
          className={`align-btn ${textAlign === 'left' ? 'active' : ''}`}
          onClick={() => setTextAlign('left')}
          title="Align left"
        >
          <FiAlignLeft size={14} />
        </button>
        <button 
          className={`align-btn ${textAlign === 'center' ? 'active' : ''}`}
          onClick={() => setTextAlign('center')}
          title="Align center"
        >
          <FiAlignCenter size={14} />
        </button>
        <button 
          className={`align-btn ${textAlign === 'right' ? 'active' : ''}`}
          onClick={() => setTextAlign('right')}
          title="Align right"
        >
          <FiAlignRight size={14} />
        </button>
      </div>

      {lastPrintedText && (
        <button 
          className="refresh-btn" 
          onClick={() => {
            setRawText(lastPrintedText);
            setNote(simulatePrinterWrapping(lastPrintedText, fontSize));
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