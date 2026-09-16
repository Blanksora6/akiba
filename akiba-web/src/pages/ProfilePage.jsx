import CategoryManager from '../components/profile/CategoryManager';

export default function ProfilePage() {
  return (
    <div>
      <h2>Profile</h2>
      <div className="goal-card" style={{ maxWidth: 280, marginBottom: 24 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13 }}>Karma</p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
          Nairobi, KE · Currency: KES
        </p>
      </div>

      <p className="section-title">Manage categories</p>
      <CategoryManager />
    </div>
  );
}