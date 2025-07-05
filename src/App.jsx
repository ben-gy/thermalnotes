import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCheck, FiX, FiLoader, FiAlignLeft, FiAlignCenter, FiAlignRight, FiCornerDownLeft } from 'react-icons/fi';
import { MdWrapText } from 'react-icons/md';
import { IoColorPaletteOutline } from 'react-icons/io5';
import { RiText } from 'react-icons/ri';
import './index.css';

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
  
  // Enter key behavior toggle - when true, Enter prints and Shift+Enter/Cmd+Enter/Ctrl+Enter create new paragraph
  // when false (default), Enter creates new paragraph and Shift+Enter/Cmd+Enter/Ctrl+Enter print
  const [enterToPrint, setEnterToPrint] = useState(() => {
    const saved = localStorage.getItem('enterToPrint');
    return saved === 'true'; // Default to false (normal behavior)
  });
  
  // First line caps toggle - when true, the first line is printed in all caps
  const [firstLineCaps, setFirstLineCaps] = useState(() => {
    const saved = localStorage.getItem('firstLineCaps');
    return saved === 'true'; // Default to false
  });
  
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [ipInput, setIpInput] = useState('');
  const [ipError, setIpError] = useState('');
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
  
  useEffect(() => {
    localStorage.setItem('enterToPrint', enterToPrint.toString());
  }, [enterToPrint]);
  
  useEffect(() => {
    localStorage.setItem('firstLineCaps', firstLineCaps.toString());
  }, [firstLineCaps]);

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
            e.preventDefault();
            if (enterToPrint) {
              // When enterToPrint is enabled, Cmd+Enter creates new paragraph
              createNewParagraph();
            } else {
              // When enterToPrint is disabled, Cmd+Enter prints (default behavior)
              handlePrint();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [isSelectionBold, isSelectionUnderline, fontSizeIndex, selectionFontSize, enterToPrint]);

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

  // Helper function to create a new paragraph
  const createNewParagraph = () => {
    // Get current selection
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
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
      e.preventDefault();
      
      if (enterToPrint) {
        // When enterToPrint is enabled:
        // - Enter prints
        // - Shift+Enter, Cmd+Enter, Ctrl+Enter create new paragraph
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          createNewParagraph();
        } else {
          handlePrint();
        }
      } else {
        // When enterToPrint is disabled (default behavior):
        // - Enter creates new paragraph
        // - Shift+Enter, Cmd+Enter, Ctrl+Enter print
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          handlePrint();
        } else {
          createNewParagraph();
        }
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
    let text = htmlToPlainText(html);
    
    if (text.trim()) {
      setLastPrintedHTML(html);
      setLastPrintedText(text);
      
      // Apply first line caps if enabled
      if (firstLineCaps) {
        const lines = text.split('\n');
        if (lines.length > 0) {
          lines[0] = lines[0].toUpperCase();
          text = lines.join('\n');
        }
      }
      
      // Debug logging
      console.log('[PRINT] Original text:', text);
      console.log('[PRINT] Font size:', fontSize, 'pt');
      console.log('[PRINT] Chars per line:', getCharsPerLine(fontSize));
      console.log('[PRINT] Word wrap enabled:', wordWrap);
      console.log('[PRINT] First line caps:', firstLineCaps);
      
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

  const handlePrinterStatusClick = async (event) => {
    if (!printerConnected && !printerScanning) {
      // If shift key is held, show manual IP dialog immediately
      if (event?.shiftKey) {
        setShowIPDialog(true);
        setIpError('');
        return;
      }
      
      // Otherwise, start automatic scanning
      console.log('[UI] Starting automatic network scan...');
      setPrinterScanning(true);
      
      try {
        // First try quick scan
        let foundPrinters = await window.api.scanNetworkPrinters(false);
        console.log('[UI] Quick scan complete, found printers:', foundPrinters);
        
        // If quick scan didn't find anything, automatically try full scan
        if (foundPrinters.length === 0) {
          console.log('[UI] Quick scan found nothing, trying full scan...');
          foundPrinters = await window.api.scanNetworkPrinters(true);
          console.log('[UI] Full scan complete, found printers:', foundPrinters);
        }
        
        if (foundPrinters.length > 0) {
          // If multiple printers found, use the first one
          const selectedIP = foundPrinters[0];
          console.log('[UI] Selecting printer at IP:', selectedIP);
          await window.api.setPrinterIP(selectedIP);
          setPrinterConnected(true);
        } else {
          console.log('[UI] No printers found during scan');
          // Show IP dialog as fallback
          setShowIPDialog(true);
          setIpError('');
        }
      } catch (err) {
        console.error('[UI] Scan error:', err);
        // Show IP dialog as fallback
        setShowIPDialog(true);
        setIpError('');
      } finally {
        setPrinterScanning(false);
      }
    }
  };

  const handleIPSubmit = async () => {
    if (ipInput.trim()) {
      console.log('[UI] Testing IP:', ipInput.trim());
      // Clear any previous error
      setIpError('');
      // Show scanning state while testing
      setPrinterScanning(true);
      
      try {
        const connected = await window.api.testPrinterIP(ipInput.trim());
        if (connected) {
          console.log('[UI] Printer found at IP:', ipInput.trim());
          setPrinterConnected(true);
          setShowIPDialog(false);
          setIpInput('');
          setIpError('');
        } else {
          console.log('[UI] No printer found at IP:', ipInput.trim());
          setIpError(`No printer found at ${ipInput.trim()}`);
        }
      } catch (err) {
        console.error('[UI] Error testing IP:', err);
        setIpError('Connection error. Please try again.');
      } finally {
        setPrinterScanning(false);
      }
    }
  };

  const handleIPCancel = () => {
    setShowIPDialog(false);
    setIpInput('');
    setIpError('');
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
              <FiX className="printer-status-icon disconnected" size={20} title="Click to scan • Shift+Click to enter IP" />
            )}
          </div>

          <div className="alignment-divider" />

          {/* Font size controls */}
          <button
            className={`font-size-btn ${fontSizeIndex === 0 ? 'active' : ''}`}
            onClick={() => {
              setFontSizeIndex(0);
              setTimeout(adjustEditorHeight, 0);
            }}
            title="Small font (20pt) • ⌘1"
            style={{ fontSize: '12px' }}
          >
            S
          </button>
          
          <button
            className={`font-size-btn ${fontSizeIndex === 1 ? 'active' : ''}`}
            onClick={() => {
              setFontSizeIndex(1);
              setTimeout(adjustEditorHeight, 0);
            }}
            title="Medium font (28pt) • ⌘2"
            style={{ fontSize: '14px' }}
          >
            M
          </button>
          
          <button
            className={`font-size-btn ${fontSizeIndex === 2 ? 'active' : ''}`}
            onClick={() => {
              setFontSizeIndex(2);
              setTimeout(adjustEditorHeight, 0);
            }}
            title="Large font (40pt) • ⌘3"
            style={{ fontSize: '16px' }}
          >
            L
          </button>
          
          <div className="alignment-divider" />
          
          {/* Alignment buttons */}
          <button 
            className={`align-btn ${textAlign === 'left' ? 'active' : ''}`}
            onClick={() => setTextAlign('left')}
            title="Align left • ⌘⇧L"
          >
            <FiAlignLeft size={18} />
          </button>
          <button 
            className={`align-btn ${textAlign === 'center' ? 'active' : ''}`}
            onClick={() => setTextAlign('center')}
            title="Align center • ⌘⇧E"
          >
            <FiAlignCenter size={18} />
          </button>
          <button 
            className={`align-btn ${textAlign === 'right' ? 'active' : ''}`}
            onClick={() => setTextAlign('right')}
            title="Align right • ⌘⇧R"
          >
            <FiAlignRight size={18} />
          </button>
          
          <div className="alignment-divider" />
          
          {/* Word wrap toggle */}
          <button 
            className={`format-btn ${wordWrap ? 'active' : ''}`}
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? "Word wrap on (preserves whole words)" : "Word wrap off (breaks anywhere)"}
          >
            <MdWrapText size={18} />
          </button>

          {/* Enter key behavior toggle */}
          <button 
            className={`format-btn ${enterToPrint ? 'active' : ''}`}
            onClick={() => setEnterToPrint(!enterToPrint)}
            title={enterToPrint ? "Enter prints, Shift+Enter creates new paragraph" : "Enter creates new paragraph, Shift+Enter prints"}
          >
            <FiCornerDownLeft size={18} />
          </button>

          <button 
            className={`format-btn ${noteColor === 'yellow' ? 'active' : ''}`}
            onClick={toggleColor}
            title={`Switch to ${noteColor === 'white' ? 'yellow' : 'white'} sticky note`}
          >
            <IoColorPaletteOutline size={18} />
          </button>

          <button 
            className={`format-btn ${firstLineCaps ? 'active' : ''}`}
            onClick={() => setFirstLineCaps(!firstLineCaps)}
            title={firstLineCaps ? "First line caps ON" : "First line caps OFF"}
          >
            <RiText size={18} />
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
            <p>No printer found. Enter your EPSON TM-m30III IP address:</p>
            <input
              type="text"
              value={ipInput}
              onChange={(e) => {
                setIpInput(e.target.value);
                setIpError(''); // Clear error on input change
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleIPSubmit()}
              placeholder="e.g. 10.0.0.231"
              className={`ip-input ${ipError ? 'error' : ''}`}
              autoFocus
            />
            {ipError && <p className="ip-error">{ipError}</p>}
            <div className="ip-dialog-buttons">
              <button onClick={handleIPCancel} className="ip-btn cancel">
                Cancel
              </button>
              <button onClick={handleIPSubmit} className="ip-btn submit" disabled={!ipInput.trim() || printerScanning}>
                {printerScanning ? 'Testing...' : 'Connect'}
              </button>
            </div>
            <p className="ip-dialog-hint">Tip: Shift+Click the printer icon to skip scanning</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 