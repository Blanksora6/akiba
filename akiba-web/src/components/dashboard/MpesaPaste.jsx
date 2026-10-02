import { useState } from 'react';
import { parseMpesaSms } from '../../mpesa/parse';

// Paste an M-Pesa confirmation SMS; on success hands the parsed fields up so
// the regular transaction form opens prefilled.
export default function MpesaPaste({ onParsed, onCancel }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  function handleRead(e) {
    e.preventDefault();
    const parsed = parseMpesaSms(text);
    if (!parsed) {
      setError("That doesn't look like an M-Pesa confirmation message. Copy the whole SMS and try again.");
      return;
    }
    onParsed(parsed);
  }

  return (
    <form onSubmit={handleRead} className="goal-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor="mpesa-sms" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Paste an M-Pesa confirmation SMS — Akiba fills in the amount, who, date and code.
      </label>
      <textarea
        id="mpesa-sms"
        rows={4}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        placeholder="SJK3ABCDEF Confirmed. Ksh1,250.00 sent to …"
        style={{ resize: 'vertical' }}
      />
      {error && <p style={{ color: 'var(--rust)', fontSize: 12, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={!text.trim()}>Read message</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
