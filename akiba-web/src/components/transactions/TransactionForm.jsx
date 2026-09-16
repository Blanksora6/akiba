import { useState, useEffect } from 'react';
import { createTransaction, updateTransaction, createSubject, createClass } from '../../api/client';

const NEW_SUBJECT = '__new_subject__';
const NEW_CLASS = '__new_class__';

// Same palette the dashboard's pie chart and category dots use — a new
// category auto-gets the next unused color rather than asking the user to
// pick one, since that's one more decision this form doesn't need to force.
const PALETTE = ['#4FAE8E', '#C9A227', '#C1583D', '#7C93C4', '#B36FB0', '#4F9DAE'];
function nextColor(existingCount) {
  return PALETTE[existingCount % PALETTE.length];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// One form, two jobs: creating a new transaction, or editing an existing one
// (editingTxn is null for "create", a transaction object for "edit").
export default function TransactionForm({ classes, editingTxn, onSaved, onCancel, onCategoriesChanged }) {
  const [classId, setClassId] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassLimit, setNewClassLimit] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingTxn) {
      setClassId(editingTxn.classId);
      setSubjectId(editingTxn.subjectId);
      setType(editingTxn.amount < 0 ? 'expense' : 'income');
      setAmount(Math.abs(editingTxn.amount).toString());
      setNote(editingTxn.note || '');
      setOccurredAt(editingTxn.occurredAt.slice(0, 10));
    } else {
      setClassId('');
      setSubjectId('');
      setType('expense');
      setAmount('');
      setNote('');
      setOccurredAt(todayISO());
    }
    setNewClassName('');
    setNewClassLimit('');
    setNewSubjectName('');
    setError(null);
  }, [editingTxn]);

  const isNewClass = classId === NEW_CLASS;
  const selectedClass = classes.find((c) => c.id === classId);
  const subjects = selectedClass ? selectedClass.subjects : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!classId) return setError('Pick a category.');
    if (isNewClass && !newClassName.trim()) return setError('Name the new category.');
    if (!isNewClass && !subjectId) return setError('Pick or add a subject.');
    if (!isNewClass && subjectId === NEW_SUBJECT && !newSubjectName.trim()) return setError('Name the new subject.');
    if (isNewClass && !newSubjectName.trim()) return setError('A brand-new category needs at least one subject.');
    if (!amount || Number(amount) <= 0) return setError('Enter an amount greater than zero.');

    setSaving(true);
    try {
      let finalClassId = classId;
      if (isNewClass) {
        finalClassId = await createClass({
          name: newClassName.trim(),
          colorHex: nextColor(classes.length),
          monthlyLimit: Number(newClassLimit) || 0,
        });
      }

      let finalSubjectId = subjectId;
      if (isNewClass || subjectId === NEW_SUBJECT) {
        finalSubjectId = await createSubject(finalClassId, newSubjectName.trim());
      }

      if (isNewClass || subjectId === NEW_SUBJECT) {
        onCategoriesChanged?.(); // lets the parent refresh its class list with what was just added
      }

      const signedAmount = type === 'expense' ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
      const payload = {
        subjectId: finalSubjectId,
        amount: signedAmount,
        note: note || null,
        occurredAt: new Date(occurredAt).toISOString(),
      };

      if (editingTxn) {
        await updateTransaction(editingTxn.id, payload);
      } else {
        await createTransaction(payload);
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
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`qa-btn${type === 'expense' ? ' active-type' : ''}`} onClick={() => setType('expense')}>Expense</button>
        <button type="button" className={`qa-btn${type === 'income' ? ' active-type' : ''}`} onClick={() => setType('income')}>Income</button>
      </div>

      <select value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(''); }}>
        <option value="">Select category…</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NEW_CLASS}>+ Add new category…</option>
      </select>

      {isNewClass && (
        <>
          <input placeholder="New category name (e.g. Transport)" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
          <input type="number" step="0.01" placeholder="Monthly budget for this category (optional)" value={newClassLimit} onChange={(e) => setNewClassLimit(e.target.value)} />
          <input placeholder="First subject in this category (e.g. Bus fare)" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} />
        </>
      )}

      {!isNewClass && classId && (
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Select subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value={NEW_SUBJECT}>+ Add new subject…</option>
        </select>
      )}

      {!isNewClass && subjectId === NEW_SUBJECT && (
        <input placeholder="New subject name" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} />
      )}

      <input type="number" step="0.01" placeholder="Amount (KES)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />

      {error && <p style={{ color: 'var(--rust)', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : editingTxn ? 'Save changes' : 'Add transaction'}
        </button>
        {editingTxn && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}