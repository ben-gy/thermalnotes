import { useEffect, useRef, useState } from 'react';
import { FiSettings } from 'react-icons/fi';
import './index.css';

function SettingsModal({ open, onClose }) {
  const [ports, setPorts] = useState([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!open) return;
    window.api.listPorts().then(setPorts);
  }, [open]);

  const save = () => {
    window.api.savePrinterPath(selected);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Printer Port</h3>
        {ports.length === 0 && <p>No serial ports detected.</p>}
        <ul className="port-list">
          {ports.map((p) => (
            <li key={p}>
              <label>
                <input
                  type="radio"
                  name="port"
                  value={p}
                  checked={selected === p}
                  onChange={() => setSelected(p)}
                />
                {p}
              </label>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={!selected} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [note, setNote] = useState('');
  const [fontSize, setFontSize] = useState(40);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const previewRef = useRef(null);

  // Adjust font size dynamically so preview stays <= 2 visible lines
  useEffect(() => {
    const MAX = 40; // starting size
    let size = MAX;
    if (!previewRef.current) return;
    const el = previewRef.current;
    // Height for 2 lines at current size (approx line-height 1.2)
    const maxHeightForSize = (s) => 2 * s * 1.3;

    el.style.fontSize = `${size}px`;
    while (el.scrollHeight > maxHeightForSize(size) && size > 16) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [note]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (note.trim()) {
        window.api.print(note.trim());
        setNote('');
      }
    }
  };

  return (
    <div className="app-card">
      <header className="card-header">
        <h2>Thermal Notes</h2>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)}>
          <FiSettings size={20} />
        </button>
      </header>

      <div className="preview" ref={previewRef} style={{ fontSize }}>
        {note || 'Your text…'}
      </div>

      <textarea
        className="note-input"
        value={note}
        placeholder="Type then press Enter to print"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="actions">
        <button className="primary" disabled={!note.trim()} onClick={() => window.api.print(note.trim())}>
          Print
        </button>
        <button className="secondary" onClick={() => window.api.reprint()}>
          Re-print Last
        </button>
      </div>

      <p className="footer">Current font size: {fontSize} pt</p>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App; 