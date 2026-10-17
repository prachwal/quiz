import { Link } from 'react-router-dom'
import { navItems } from './navItems'

/** Phone-only tab bar (shown below 768px by index.css, hidden on focus screens). */
export default function BottomNav({ selected }: { selected: string }) {
  return (
    <nav className="app-tabbar" aria-label="Nawigacja dolna">
      {navItems
        .filter((item) => item.tab)
        .map((item) => (
          <Link
            key={item.key}
            to={item.key}
            className="app-tab"
            aria-current={item.key === selected ? 'page' : undefined}
          >
            <span className="app-tab-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="app-tab-label">{item.label}</span>
          </Link>
        ))}
    </nav>
  )
}
