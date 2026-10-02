import { useEffect, useState } from 'react';
import './styles/theme.css';
import Sidebar from './components/layout/Sidebar';
import TabBar from './components/layout/TabBar';
import LoginScreen from './components/auth/LoginScreen';
import HomePage from './pages/HomePage';
import TransactionsPage from './pages/TransactionsPage';
import GoalsPage from './pages/GoalsPage';
import InsightsPage from './pages/InsightsPage';
import ProfilePage from './pages/ProfilePage';
import { NAV_ITEMS } from './navItems';
import { getStoredAuth } from './api/client';

const PAGES = {
  home: HomePage,
  transactions: TransactionsPage,
  goals: GoalsPage,
  insights: InsightsPage,
  profile: ProfilePage,
};

// The open page lives in the URL hash (#insights), so a refresh or a shared
// link lands on the same page instead of always going back to Home.
function pageFromHash() {
  const key = window.location.hash.slice(1);
  return key in PAGES ? key : 'home';
}

function App() {
  const [auth, setAuth] = useState(getStoredAuth());
  const [activeKey, setActiveKey] = useState(pageFromHash);

  useEffect(() => {
    const onHashChange = () => setActiveKey(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(key) {
    window.location.hash = key;
  }

  if (!auth) {
    return <LoginScreen onSignedIn={setAuth} />;
  }

  const PageComponent = PAGES[activeKey];

  return (
    <>
      <div className="app-shell">
        <Sidebar items={NAV_ITEMS} activeKey={activeKey} onNavigate={navigate} />
        <main className="main">
          <PageComponent />
        </main>
      </div>
      <TabBar items={NAV_ITEMS} activeKey={activeKey} onNavigate={navigate} />
    </>
  );
}

export default App;
