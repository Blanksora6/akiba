import { useEffect, useState } from 'react';
import { getClasses, updateClass, deleteClass } from '../../api/client';

// Deleting here is safe even for a category already used on past transactions
// or goals — the delete is soft (IsDeleted flag) on the backend, and the
// transaction/goal list queries never filter on it, so old records keep
// showing their original category name. Deleting only removes it from the
// "+ Add new category" picker going forward, nothing retroactive breaks.
export default function CategoryManager() {
  const [classes, setClasses] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [error, setError] = useState(null);

  async function refresh() {
    try {
      setClasses(await getClasses());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  function startEdit(c) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditLimit(c.monthlyLimit.toString());
  }

  async function saveEdit(c) {
    try {
      await updateClass(c.id, { name: editName.trim(), colorHex: c.colorHex, monthlyLimit: Number(editLimit) || 0 });
      setEditingId(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id, name) {
    const confirmed = window.confirm(
      `Delete "${name}"? You won't be able to add new transactions or goals to it afterward.`
    );
    if (!confirmed) return;

    try {
      await deleteClass(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p style={{ color: 'var(--rust)', fontSize: 12 }}>{error}</p>;
  if (!classes) return <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div>
      {classes.map((c) => (
        <div className="class-row" key={c.id}>
          {editingId === c.id ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
              <input type="number" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} style={{ width: 100 }} />
              <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => saveEdit(c)}>Save</button>
              <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <div className="class-head">
              <div className="class-left">
                <span className="class-dot" style={{ background: c.colorHex }} />
                <span className="class-name">{c.name}</span>
              </div>
              <div className="class-right">
                <span className="class-amt mono">Limit {c.monthlyLimit.toLocaleString()}</span>
                <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => startEdit(c)}>Edit</button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => handleDelete(c.id, c.name)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    fontSize: 15,
                    color: 'var(--rust)',
                    borderColor: 'var(--rust)',
                  }}
                >
                  −
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}