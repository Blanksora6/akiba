import { useState, useEffect } from 'react';
import { createGoal, updateGoal, createClass } from '../../api/client';

const NEW_CLASS = '__new_class__';
const PALETTE = ['#4FAE8E', '#C9A227', '#C1583D', '#7C93C4', '#B36FB0', '#4F9DAE'];
function nextColor(n) { return PALETTE[n % PALETTE.length]; }

// One-time vs recurring is a real either/or on the backend (CreateGoalRequest
// rejects both-or-neither), so this form enforces the same choice as a toggle
// rather than two independent optional fields.
export default function GoalForm({ classes, editingGoal, onSaved, onCancel, onCategoriesChanged }) {
  const [classId, setClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassLimit, setNewClassLimit] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState('target'); // 'target' | 'recurring'
  const [targetDate, setTargetDate] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingGoal) {
      setClassId(editingGoal.classId);
      setName(editingGoal.name);
      setPrice(editingGoal.price.toString());
      setMode(editingGoal.isRecurring ? 'recurring' : 'target');
      setTargetDate(editingGoal.targetDate ? editingGoal.targetDate.slice(0, 10) : '');
      setIntervalMonths(editingGoal.intervalMonths ? editingGoal.intervalMonths.toString() : '');
    } else {
      setClassId('');
      setName('');
      setPrice('');
      setMode('target');
      setTargetDate('');
      setIntervalMonths('');
    }
    setNewClassName('');
    setNewClassLimit('');
    setError(null);
  }, [editingGoal]);

  const isNewClass = classId === NEW_CLASS;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!classId) return setError('Pick a category.');
    if (isNewClass && !newClassName.trim()) return setError('Name the new category.');
    if (!name.trim()) return setError('Name the goal.');
    if (!price || Number(price) <= 0) return setError('Enter a price greater than zero.');
    if (mode === 'target' && !targetDate) return setError('Pick a target date.');
    if (mode === 'recurring' && (!intervalMonths || Number(intervalMonths) <= 0)) return setError('Enter a repeat interval in months.');

    setSaving(true);
    try {
      let finalClassId = classId;
      if (isNewClass) {
        finalClassId = await createClass({
          name: newClassName.trim(),
          colorHex: nextColor(classes.length),
          monthlyLimit: Number(newClassLimit) || 0,
        });
        onCategoriesChanged?.();
      }

      const payload = {
        classId: finalClassId,
        name: name.trim(),
        price: Number(price),
        targetDate: mode === 'target' ? new Date(targetDate).toISOString() : null,
        isRecurring: mode === 'recurring',
        intervalMonths: mode === 'recurring' ? Number(intervalMonths) : null,
      };

      if (editingGoal) {
        await updateGoal(editingGoal.id, { ...payload, isPurchased: editingGoal.isPurchased });
      } else {
        await createGoal(payload);
      }

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="goal-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <select value={classId} onChange={(e) => setClassId(e.target.value)}>
        <option value="">Select category…</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NEW_CLASS}>+ Add new category…</option>
      </select>

      {isNewClass && (
        <>
          <input placeholder="New category name" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
          <input type="number" step="0.01" placeholder="Monthly budget for this category (optional)" value={newClassLimit} onChange={(e) => setNewClassLimit(e.target.value)} />
        </>
      )}

      <input placeholder='What are you saving for? (e.g. 27" Monitor)' value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" step="0.01" placeholder="Price (KES)" value={price} onChange={(e) => setPrice(e.target.value)} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`qa-btn${mode === 'target' ? ' active-type' : ''}`} onClick={() => setMode('target')}>One-time</button>
        <button type="button" className={`qa-btn${mode === 'recurring' ? ' active-type' : ''}`} onClick={() => setMode('recurring')}>Recurring</button>
      </div>

      {mode === 'target' ? (
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      ) : (
        <input type="number" placeholder="Repeat every how many months?" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} />
      )}

      {error && <p style={{ color: 'var(--rust)', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : editingGoal ? 'Save changes' : 'Add goal'}
        </button>
        {editingGoal && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}