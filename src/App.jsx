import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCircle, FiPlus, FiMinus } from 'react-icons/fi';
import { FaCircle } from 'react-icons/fa';
import './index.css';

function App() {
  const [note, setNote] = useState('');
  const [lastPrintedText, setLastPrintedText] = useState('');
  const [noteColor, setNoteColor] = useState(() => {
    return localStorage.getItem('noteColor') || 'white';
  });
  const [fontSize, setFontSize] = useState(() => {
    return parseInt(localStorage.getItem('fontSize')) || 30;
  });
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

  const handleChange = (e) => {
    setNote(e.target.value);
    setTimeout(adjustTextareaHeight, 0); // Adjust height after state update
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (note.trim()) {
        setLastPrintedText(note.trim());
        window.api.print(note.trim());
        setNote('');
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

  return (
    <div 
      className="sticky-root" 
      style={{ background: noteColor === 'yellow' ? '#fff9c4' : '#fff' }}
    >
      <textarea
        className="note-area"
        ref={previewRef}
        style={{ fontSize: `${fontSize}pt` }}
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
      </div>

      {lastPrintedText && (
        <button 
          className="refresh-btn" 
          onClick={() => setNote(lastPrintedText)}
          title="Restore last printed text"
        >
          <FiRefreshCw size={16} />
        </button>
      )}
    </div>
  );
}

export default App; 