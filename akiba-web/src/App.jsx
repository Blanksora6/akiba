import { useState } from 'react';
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

function App() {
  const [auth, setAuth] = useState(getStoredAuth());
  const [activeKey, setActiveKey] = useState('home');

  if (!auth) {
    return <LoginScreen onSignedIn={setAuth} />;
  }

  const PageComponent = PAGES[activeKey];

  return (
    <>
      <div className="app-shell">
        <Sidebar items={NAV_ITEMS} activeKey={activeKey} onNavigate={setActiveKey} />
        <main className="main">
          <PageComponent />
        </main>
      </div>
      <TabBar items={NAV_ITEMS} activeKey={activeKey} onNavigate={setActiveKey} />
    </>
  );
}

export default App;
