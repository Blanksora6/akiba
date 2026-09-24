import { useEffect, useState } from 'react';
import { getStoredAuth, clearStoredAuth, getProfile, updateNickname } from '../api/client';
import CategoryManager from '../components/profile/CategoryManager';

export default function ProfilePage() {
  const auth = getStoredAuth();
  const [profile, setProfile] = useState(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    getProfile().then(setProfile).catch((err) => setError(err.message));
  }, []);

  function startEditNickname() {
    setNicknameInput(profile.nickname || '');
    setEditingNickname(true);
  }

  async function saveNickname() {
    try {
      const updated = await updateNickname(nicknameInput.trim());
      setProfile(updated);
      setEditingNickname(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSignOut() {
    clearStoredAuth();
    window.location.reload();
  }

  return (
    <div>
      <h2>Profile</h2>
      <div className="goal-card" style={{ maxWidth: 320, marginBottom: 12 }}>
        {editingNickname ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder={profile?.displayName}
              style={{ flex: 1 }}
            />
            <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={saveNickname}>Save</button>
            <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditingNickname(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              {profile?.nickname || profile?.displayName || 'Loading…'}
            </p>
            {profile && (
              <button type="button" style={{ fontSize: 11, padding: '4px 8px' }} onClick={startEditNickname}>
                {profile.nickname ? 'Edit nickname' : 'Set nickname'}
              </button>
            )}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
          {profile?.displayName} · {auth?.email} · Currency: KES
        </p>
      </div>

      {error && <p style={{ color: 'var(--rust)', fontSize: 12 }}>{error}</p>}

      <button type="button" onClick={handleSignOut} style={{ marginBottom: 24 }}>Sign out</button>

      <p className="section-title">Manage categories</p>
      <CategoryManager />
    </div>
  );
}