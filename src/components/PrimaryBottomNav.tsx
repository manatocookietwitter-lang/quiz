import { AddSquareIcon, GroupIcon, HomeIcon, SearchIcon, SettingsIcon } from './UiIcons';
import './PrimaryBottomNav.css';

export type PrimaryNavItem = 'home' | 'discover' | 'groups' | 'create' | 'settings';

interface PrimaryBottomNavProps {
  active: PrimaryNavItem;
  onSelect: (item: PrimaryNavItem) => void;
}

const items: Array<{
  id: PrimaryNavItem;
  label: string;
  shortLabel?: string;
  icon: typeof HomeIcon;
}> = [
  { id: 'home', label: 'ホーム', icon: HomeIcon },
  { id: 'discover', label: '見つける', icon: SearchIcon },
  { id: 'groups', label: 'グループ', icon: GroupIcon },
  { id: 'create', label: '問題セットを作る', shortLabel: '問題作成', icon: AddSquareIcon },
  { id: 'settings', label: '設定', icon: SettingsIcon },
];

export function PrimaryBottomNav({ active, onSelect }: PrimaryBottomNavProps) {
  return (
    <nav className="primary-bottom-nav" aria-label="メインメニュー">
      <div className="primary-bottom-nav__inner">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              className={selected ? 'primary-bottom-nav__item primary-bottom-nav__item--active' : 'primary-bottom-nav__item'}
              aria-current={selected ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={24} />
              <span>{item.shortLabel ?? item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
