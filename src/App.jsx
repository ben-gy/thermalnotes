import { useEffect, useRef, useState } from 'react';
import { FiRefreshCw, FiCircle } from 'react-icons/fi';
import { FaCircle } from 'react-icons/fa';
import './index.css';

function App() {
  const [note, setNote] = useState('');
  const [fontSize, setFontSize] = useState(40);
  const [lastPrintedText, setLastPrintedText] = useState('');
  const [noteColor, setNoteColor] = useState('white');
  const previewRef = useRef(null);

  // Hardcoded font size values
  const MAX_FONT = 40;
  const MIN_FONT = 16;

  useEffect(() => {
    let size = MAX_FONT;
    if (!previewRef.current) return;
    const el = previewRef.current;
    // Height for 2 lines at current size (approx line-height 1.2)
    const maxHeightForSize = (s) => 2 * s * 1.3;

    el.style.fontSize = `${size}px`;
    while (el.scrollHeight > maxHeightForSize(size) && size > MIN_FONT) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [note]);

  // Resize window to fit content
  useEffect(() => {
    const noteH = previewRef.current ? previewRef.current.scrollHeight : 0;
    const total = 30 + noteH + 30; // top padding + content + bottom padding
    window.api.resizeWindow(Math.ceil(total));
  }, [note, fontSize]);

  // Focus on load
  useEffect(() => {
    setTimeout(() => previewRef.current && previewRef.current.focus(), 50);
  }, []);

  // Update body background to match sticky colour
  useEffect(() => {
    document.body.style.background = noteColor === 'yellow' ? '#fff9c4' : '#ffffff';
  }, [noteColor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (note.trim()) {
        setLastPrintedText(note.trim());
        window.api.print(note.trim());
        setNote('');
      }
    }
  };

  const toggleColor = () => {
    setNoteColor(noteColor === 'white' ? 'yellow' : 'white');
  };

  return (
    <div 
      className="sticky-root" 
      style={{ background: noteColor === 'yellow' ? '#fff9c4' : '#fff' }}
    >
      <textarea
        className="note-area"
        ref={previewRef}
        style={{ fontSize }}
        value={note}
        onChange={(e) => setNote(e.target.value)}
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