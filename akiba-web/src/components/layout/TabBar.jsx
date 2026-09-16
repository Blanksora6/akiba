export default function TabBar({ items, activeKey, onNavigate }) {
  return (
    <div className="tabbar">
      {items.map((item) => (
        <div
          key={item.key}
          className={`tab-item${activeKey === item.key ? ' active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          <span>●</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}