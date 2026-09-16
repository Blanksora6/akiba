export default function Sidebar({ items, activeKey, onNavigate }) {
  return (
    <nav className="nav">
      {items.map((item) => (
        <div
          key={item.key}
          className={`nav-item${activeKey === item.key ? ' active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          ●<span className="nav-label">{item.label}</span>
        </div>
      ))}
    </nav>
  );
}