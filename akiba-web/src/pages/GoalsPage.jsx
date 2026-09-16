import { useEffect, useState } from 'react';
import { getClasses, getGoals, deleteGoal, updateGoal } from '../api/client';
import GoalForm from '../components/goals/GoalForm';
import GoalList from '../components/goals/GoalList';

export default function GoalsPage() {
  const [classes, setClasses] = useState(null);
  const [goals, setGoals] = useState(null);
  const [showPurchased, setShowPurchased] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    try {
      const [cls, gls] = await Promise.all([getClasses(), getGoals({ includePurchased: showPurchased })]);
      setClasses(cls);
      setGoals(gls);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { refresh(); }, [showPurchased]);

  async function handleDelete(id) {
    try {
      await deleteGoal(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTogglePurchased(goal) {
    try {
      await updateGoal(goal.id, {
        name: goal.name,
        price: goal.price,
        targetDate: goal.targetDate,
        isRecurring: goal.isRecurring,
        intervalMonths: goal.intervalMonths,
        isPurchased: !goal.isPurchased,
      });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSaved() {
    setEditingGoal(null);
    refresh();
  }

  if (error) return <p style={{ color: 'var(--rust)' }}>Error: {error}</p>;
  if (!classes || !goals) return <p>Loading…</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>Goals</h2>
      <div className="grid2">
        <div>
          <p className="section-title">{editingGoal ? 'Edit goal' : 'Add goal'}</p>
          <GoalForm
            classes={classes}
            editingGoal={editingGoal}
            onSaved={handleSaved}
            onCancel={() => setEditingGoal(null)}
            onCategoriesChanged={refresh}
          />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="section-title" style={{ margin: 0 }}>Planned purchases</p>
            <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setShowPurchased(!showPurchased)}>
              {showPurchased ? 'Hide purchased' : 'Show purchased'}
            </button>
          </div>
          <GoalList
            goals={goals}
            onEdit={setEditingGoal}
            onDelete={handleDelete}
            onTogglePurchased={handleTogglePurchased}
          />
        </div>
      </div>
    </div>
  );
}