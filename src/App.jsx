import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCheck, FiX, FiLoader, FiAlignLeft, FiAlignCenter, FiAlignRight, FiBold, FiUnderline } from 'react-icons/fi';
import { MdWrapText } from 'react-icons/md';
import { IoColorPaletteOutline } from 'react-icons/io5';
import './index.css';



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
  // Font size presets - simplified to 3 distinct sizes
  const FONT_SIZES = [20, 28, 40]; // small, medium, large
  const FONT_SIZE_LABELS = ['Small', 'Medium', 'Large'];
  const DEFAULT_FONT_SIZE_INDEX = 1; // medium (28pt)
  
  const [lastPrintedHTML, setLastPrintedHTML] = useState('');
  const [lastPrintedText, setLastPrintedText] = useState('');
  const [noteColor, setNoteColor] = useState(() => {
    return localStorage.getItem('noteColor') || 'white';
  });
  
  // Default document font size
  const [fontSizeIndex, setFontSizeIndex] = useState(() => {
    const saved = localStorage.getItem('fontSizeIndex');
    if (saved) {
      const index = parseInt(saved);
      // Ensure index is valid for new 3-size array
      return Math.min(index, FONT_SIZES.length - 1);
    }
    return DEFAULT_FONT_SIZE_INDEX;
  });
  const fontSize = FONT_SIZES[fontSizeIndex];
  
  const [textAlign, setTextAlign] = useState(() => {
    return localStorage.getItem('textAlign') || 'center';
  });
  const [wordWrap, setWordWrap] = useState(() => {
    const saved = localStorage.getItem('wordWrap');
    return saved === null ? true : saved === 'true'; // Default to true (word wrapping on)
  });
  
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [ipInput, setIpInput] = useState('');
  const editorRef = useRef(null);
  const [isSelectionBold, setIsSelectionBold] = useState(false);
  const [isSelectionUnderline, setIsSelectionUnderline] = useState(false);
  const [selectionFontSize, setSelectionFontSize] = useState(null);

  // Auto-resize editor height based on content
  const adjustEditorHeight = () => {
    if (editorRef.current) {
      // Force a reflow to ensure accurate measurements
      editorRef.current.style.height = 'auto';
      // Force browser to recalculate
      void editorRef.current.offsetHeight;
      
      // Get the actual content height - use ceil to handle fractional pixels
      const scrollHeight = Math.ceil(editorRef.current.scrollHeight);
      
      // Set the height
      editorRef.current.style.height = scrollHeight + 'px';
      
      // Calculate total window height to match visual margins
      // Fixed components:
      // 44px - controls header
      // 15px - paper margin top (matches sides)
      // 20px - paper padding top
      // 20px - paper padding bottom  
      // 15px - paper margin bottom (matches sides)
      const fixedHeight = 44 + 15 + 20 + 20 + 15;
      const windowHeight = fixedHeight + scrollHeight;
      const windowWidth = 332;
      
      window.api.resizeWindow(windowHeight, windowWidth);
    }
  };

  // Update selection state
  const updateSelectionState = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      
      // Check if selection is within our editor
      if (editorRef.current && editorRef.current.contains(container)) {
        // Check bold
        const isBold = document.queryCommandState('bold');
        setIsSelectionBold(isBold);
        
        // Check underline
        const isUnderline = document.queryCommandState('underline');
        setIsSelectionUnderline(isUnderline);
        
        // Check font size - this is more complex with contenteditable
        // For now, we'll just check if all selected text has the same font size
        // This is a simplified approach
        try {
          const computedStyle = window.getComputedStyle(
            container.nodeType === Node.TEXT_NODE ? container.parentElement : container
          );
          const currentSize = parseInt(computedStyle.fontSize);
          const sizeIndex = FONT_SIZES.findIndex(size => Math.abs(size - currentSize) < 2);
          setSelectionFontSize(sizeIndex >= 0 ? sizeIndex : null);
        } catch (e) {
          setSelectionFontSize(null);
        }
      }
    } else {
      setIsSelectionBold(false);
      setIsSelectionUnderline(false);
      setSelectionFontSize(null);
    }
  };

  // Resize window to fit content
  useEffect(() => {
    // Small delay to ensure proper rendering
    const timeoutId = setTimeout(() => {
      adjustEditorHeight();
    }, 10);
    
    return () => clearTimeout(timeoutId);
  }, [fontSize]); // Add fontSize as dependency to resize when it changes

  // Get characters per line based on font size for EPSON TM-m30III
  const getCharsPerLine = (fontSizePt) => {
    // Calibrated based on actual printer output
    if (fontSizePt >= 40) return 12;      // Large: ~12 chars
    else if (fontSizePt >= 28) return 17; // Medium: ~17 chars
    else return 24;                        // Small: ~24 chars (was 30, but printer shows ~24)
  };

  // Monitor content changes
  useEffect(() => {
    const handleInput = () => {
      adjustEditorHeight();
    };
    
    const editor = editorRef.current;
    if (editor) {
      editor.addEventListener('input', handleInput);
      
      // Also monitor selection changes
      document.addEventListener('selectionchange', updateSelectionState);
      
      return () => {
        editor.removeEventListener('input', handleInput);
        document.removeEventListener('selectionchange', updateSelectionState);
      };
    }
  }, []);

  // Focus on load
  useEffect(() => {
    setTimeout(() => {
      if (editorRef.current) {
        // Ensure contenteditable starts with a paragraph
        if (editorRef.current.innerHTML === '') {
          editorRef.current.innerHTML = '<p><br></p>';
        }
        editorRef.current.focus();
        adjustEditorHeight();
      }
    }, 50);
    
    // Set initial window size with same calculation (no buffer)
    // Using estimated initial scrollHeight of 24px for one line
    const initialHeight = 44 + 15 + 20 + 20 + 15 + 24; // Fixed components + estimated content
    window.api.resizeWindow(initialHeight, 332);
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('noteColor', noteColor);
  }, [noteColor]);

  useEffect(() => {
    localStorage.setItem('fontSizeIndex', fontSizeIndex.toString());
  }, [fontSizeIndex]);

  useEffect(() => {
    localStorage.setItem('textAlign', textAlign);
  }, [textAlign]);

  useEffect(() => {
    localStorage.setItem('wordWrap', wordWrap.toString());
  }, [wordWrap]);

  // Apply formatting commands
  const applyFormat = (command, value = null) => {
    editorRef.current.focus();
    document.execCommand(command, false, value);
    updateSelectionState();
  };

  // Toggle bold for selection
  const toggleBold = () => {
    applyFormat('bold');
  };

  // Toggle underline for selection
  const toggleUnderline = () => {
    applyFormat('underline');
  };

  // Change font size for selection
  const changeSelectionFontSize = (newSizeIndex) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      
      // Create a span with the new font size
      const span = document.createElement('span');
      span.style.fontSize = `${FONT_SIZES[newSizeIndex]}pt`;
      
      // Extract and wrap the selected content
      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
        
        // Restore selection
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        selection.addRange(newRange);
      } catch (e) {
        console.error('Failed to change font size:', e);
      }
    }
    updateSelectionState();
    adjustEditorHeight(); // Ensure editor resizes after changing text size
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcut = (e) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      const isCtrlCmd = e.metaKey || e.ctrlKey;
      
      if (isCtrlCmd) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            toggleBold();
            break;
          case 'u':
            e.preventDefault();
            toggleUnderline();
            break;
          case '1':
            e.preventDefault();
            // If there's a selection, change its size to small
            const selection1 = window.getSelection();
            if (selection1.rangeCount > 0 && !selection1.isCollapsed) {
              changeSelectionFontSize(0); // Small
            } else {
              setFontSizeIndex(0);
              setTimeout(adjustEditorHeight, 0);
            }
            break;
          case '2':
            e.preventDefault();
            // If there's a selection, change its size to medium
            const selection2 = window.getSelection();
            if (selection2.rangeCount > 0 && !selection2.isCollapsed) {
              changeSelectionFontSize(1); // Medium
            } else {
              setFontSizeIndex(1);
              setTimeout(adjustEditorHeight, 0);
            }
            break;
          case '3':
            e.preventDefault();
            // If there's a selection, change its size to large
            const selection3 = window.getSelection();
            if (selection3.rangeCount > 0 && !selection3.isCollapsed) {
              changeSelectionFontSize(2); // Large
            } else {
              setFontSizeIndex(2);
              setTimeout(adjustEditorHeight, 0);
            }
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
          case 'enter':
            // Cmd+Enter to print
            e.preventDefault();
            handlePrint();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [isSelectionBold, isSelectionUnderline, fontSizeIndex, selectionFontSize]);

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
      } else if (!wordWrap) {
        // Character wrapping (original behavior)
        for (let i = 0; i < line.length; i += charsPerLine) {
          wrappedLines.push(line.slice(i, i + charsPerLine));
        }
      } else {
        // Word wrapping - preserve whole words
        const words = line.split(' ');
        let currentLine = '';
        
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine ? currentLine + ' ' + word : word;
          
          if (testLine.length <= charsPerLine) {
            // Word fits on current line
            currentLine = testLine;
          } else {
            // Word doesn't fit
            if (currentLine) {
              // Save current line and start new one
              wrappedLines.push(currentLine);
              currentLine = word;
            } else {
              // Word is longer than line width - force break it
              let longWord = word;
              while (longWord.length > charsPerLine) {
                wrappedLines.push(longWord.slice(0, charsPerLine));
                longWord = longWord.slice(charsPerLine);
              }
              if (longWord) {
                currentLine = longWord;
              }
            }
          }
        }
        
        // Don't forget the last line
        if (currentLine) {
          wrappedLines.push(currentLine);
        }
      }
    }
    
    return wrappedLines.join('\n');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: Create new paragraph
        e.preventDefault();
        
        // Get current selection
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        
        // Create a new paragraph element
        const newParagraph = document.createElement('p');
        const br = document.createElement('br');
        newParagraph.appendChild(br);
        
        // Insert the new paragraph after the current block
        let currentBlock = range.commonAncestorContainer;
        if (currentBlock.nodeType === Node.TEXT_NODE) {
          currentBlock = currentBlock.parentNode;
        }
        
        // Find the paragraph or div parent
        while (currentBlock && currentBlock !== editorRef.current && 
               currentBlock.tagName !== 'P' && currentBlock.tagName !== 'DIV') {
          currentBlock = currentBlock.parentNode;
        }
        
        if (currentBlock && currentBlock !== editorRef.current) {
          currentBlock.parentNode.insertBefore(newParagraph, currentBlock.nextSibling);
        } else {
          editorRef.current.appendChild(newParagraph);
        }
        
        // Move cursor to the new paragraph
        const newRange = document.createRange();
        newRange.setStart(newParagraph, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        adjustEditorHeight();
      } else {
        // Enter only: Print
        e.preventDefault();
        handlePrint();
      }
    }
  };

  const handlePaste = (e) => {
    // Prevent default paste behavior
    e.preventDefault();
    
    // Get plain text from clipboard
    let text = '';
    if (e.clipboardData || e.originalEvent?.clipboardData) {
      text = (e.clipboardData || e.originalEvent.clipboardData).getData('text/plain');
    } else if (window.clipboardData) {
      // IE fallback
      text = window.clipboardData.getData('Text');
    }
    
    if (text) {
      // Clean the text:
      // 1. Remove any zero-width characters
      text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // 2. Normalize whitespace (but preserve intentional line breaks)
      text = text.replace(/\r\n/g, '\n'); // Windows line endings to Unix
      text = text.replace(/\r/g, '\n');    // Old Mac line endings to Unix
      
      // 3. Remove any control characters except newlines and tabs
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // 4. Convert tabs to spaces (4 spaces per tab)
      text = text.replace(/\t/g, '    ');
      
      // 5. Trim trailing whitespace from each line
      text = text.split('\n').map(line => line.trimEnd()).join('\n');
      
      // Insert the cleaned plain text
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      selection.deleteFromDocument();
      
      // Split text by newlines and insert as separate paragraphs if needed
      const lines = text.split('\n');
      
      if (lines.length === 1) {
        // Single line - just insert as text
        const textNode = document.createTextNode(lines[0]);
        selection.getRangeAt(0).insertNode(textNode);
        
        // Move cursor after inserted text
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Multiple lines - create paragraphs
        const range = selection.getRangeAt(0);
        let currentContainer = range.startContainer;
        
        // Find the current paragraph
        while (currentContainer && currentContainer !== editorRef.current && 
               currentContainer.nodeType !== Node.ELEMENT_NODE) {
          currentContainer = currentContainer.parentNode;
        }
        
        // Insert first line in current paragraph
        if (lines[0]) {
          const firstText = document.createTextNode(lines[0]);
          range.insertNode(firstText);
        }
        
        // Create new paragraphs for remaining lines
        let lastElement = currentContainer;
        for (let i = 1; i < lines.length; i++) {
          const p = document.createElement('p');
          if (lines[i]) {
            p.textContent = lines[i];
          } else {
            p.appendChild(document.createElement('br'));
          }
          
          if (lastElement && lastElement.parentNode) {
            lastElement.parentNode.insertBefore(p, lastElement.nextSibling);
          } else {
            editorRef.current.appendChild(p);
          }
          lastElement = p;
        }
        
        // Move cursor to end of last inserted paragraph
        if (lastElement) {
          const newRange = document.createRange();
          newRange.selectNodeContents(lastElement);
          newRange.collapse(false);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
      
      adjustEditorHeight();
    }
  };

  // Convert HTML content to plain text for printing
  const htmlToPlainText = (html) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Replace <br> with newlines
    const brs = temp.getElementsByTagName('br');
    for (let i = brs.length - 1; i >= 0; i--) {
      brs[i].replaceWith('\n');
    }
    
    // Replace </p><p> with double newlines for paragraphs
    let text = temp.innerHTML;
    text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
    
    // Remove all other HTML tags
    text = text.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    text = textarea.value;
    
    // Clean up extra whitespace
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines in a row
    text = text.trim();
    
    return text;
  };

  const handlePrint = () => {
    const html = editorRef.current.innerHTML;
    const text = htmlToPlainText(html);
    
    if (text.trim()) {
      setLastPrintedHTML(html);
      setLastPrintedText(text);
      
      // Debug logging
      console.log('[PRINT] Original text:', text);
      console.log('[PRINT] Font size:', fontSize, 'pt');
      console.log('[PRINT] Chars per line:', getCharsPerLine(fontSize));
      console.log('[PRINT] Word wrap enabled:', wordWrap);
      
      // Apply printer wrapping before sending to printer
      const wrappedText = simulatePrinterWrapping(text.trim(), fontSize);
      
      console.log('[PRINT] Wrapped text:', wrappedText);
      console.log('[PRINT] Wrapped lines:', wrappedText.split('\n'));
      
      window.api.print(wrappedText, textAlign, fontSize, false, false);
      
      // Clear the editor and start with a paragraph
      editorRef.current.innerHTML = '<p><br></p>';
      editorRef.current.focus();
      adjustEditorHeight();
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
    <div className="sticky-root">
      <div className="controls-header">
        <div className="font-controls">
          <div className="printer-status" onClick={handlePrinterStatusClick}>
            {printerConnected ? (
              <FiCheck className="printer-status-icon connected" size={20} title="Printer connected" />
            ) : printerScanning ? (
              <FiLoader className="printer-status-icon scanning" size={20} title="Scanning for printer..." />
            ) : (
              <FiX className="printer-status-icon disconnected" size={20} title="Click to scan for printer" />
            )}
          </div>

          <div className="alignment-divider" />

          {/* Font size controls */}
          <Tooltip shortcut="⌘1">
            <button
              className={`font-size-btn ${fontSizeIndex === 0 ? 'active' : ''}`}
              onClick={() => {
                setFontSizeIndex(0);
                setTimeout(adjustEditorHeight, 0);
              }}
              title="Small font (20pt)"
              style={{ fontSize: '12px' }}
            >
              S
            </button>
          </Tooltip>
          
          <Tooltip shortcut="⌘2">
            <button
              className={`font-size-btn ${fontSizeIndex === 1 ? 'active' : ''}`}
              onClick={() => {
                setFontSizeIndex(1);
                setTimeout(adjustEditorHeight, 0);
              }}
              title="Medium font (28pt)"
              style={{ fontSize: '14px' }}
            >
              M
            </button>
          </Tooltip>
          
          <Tooltip shortcut="⌘3">
            <button
              className={`font-size-btn ${fontSizeIndex === 2 ? 'active' : ''}`}
              onClick={() => {
                setFontSizeIndex(2);
                setTimeout(adjustEditorHeight, 0);
              }}
              title="Large font (40pt)"
              style={{ fontSize: '16px' }}
            >
              L
            </button>
          </Tooltip>
          
          <div className="alignment-divider" />
          
          {/* Bold and Underline */}
          {/* <Tooltip shortcut="⌘B">
            <button 
              className={`format-btn ${isSelectionBold ? 'active' : ''}`}
              onClick={toggleBold}
              title="Bold"
            >
              <FiBold size={18} />
            </button>
          </Tooltip>
          <Tooltip shortcut="⌘U">
            <button 
              className={`format-btn ${isSelectionUnderline ? 'active' : ''}`}
              onClick={toggleUnderline}
              title="Underline"
            >
              <FiUnderline size={18} />
            </button>
          </Tooltip> */}
          
          {/* <div className="alignment-divider" /> */}
          
          {/* Alignment buttons */}
          <Tooltip shortcut="⌘⇧L">
            <button 
              className={`align-btn ${textAlign === 'left' ? 'active' : ''}`}
              onClick={() => setTextAlign('left')}
              title="Align left"
            >
              <FiAlignLeft size={18} />
            </button>
          </Tooltip>
          <Tooltip shortcut="⌘⇧E">
            <button 
              className={`align-btn ${textAlign === 'center' ? 'active' : ''}`}
              onClick={() => setTextAlign('center')}
              title="Align center"
            >
              <FiAlignCenter size={18} />
            </button>
          </Tooltip>
          <Tooltip shortcut="⌘⇧R">
            <button 
              className={`align-btn ${textAlign === 'right' ? 'active' : ''}`}
              onClick={() => setTextAlign('right')}
              title="Align right"
            >
              <FiAlignRight size={18} />
            </button>
          </Tooltip>
          
          <div className="alignment-divider" />
          
          {/* Word wrap toggle */}
          <button 
            className={`format-btn ${wordWrap ? 'active' : ''}`}
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? "Word wrap on (preserves whole words)" : "Word wrap off (breaks anywhere)"}
          >
            <MdWrapText size={18} />
          </button>

          <button 
            className={`format-btn ${noteColor === 'yellow' ? 'active' : ''}`}
            onClick={toggleColor}
            title={`Switch to ${noteColor === 'white' ? 'yellow' : 'white'} sticky note`}
          >
            <IoColorPaletteOutline size={18} />
          </button>
        </div>
      </div>

      <div 
        className="paper-container" 
        style={{ background: noteColor === 'yellow' ? '#fff9c4' : '#ffffff' }}
      >
        <div
          className="note-area"
          ref={editorRef}
          contentEditable="true"
          style={{ 
            fontSize: `${fontSize}pt`, 
            textAlign,
            minHeight: '24px' // Ensure minimum height
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          data-placeholder="TYPE HERE"
        />
      </div>

              {lastPrintedHTML && (
          <button 
            className="refresh-btn" 
            onClick={() => {
              editorRef.current.innerHTML = lastPrintedHTML;
              editorRef.current.focus();
              adjustEditorHeight();
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