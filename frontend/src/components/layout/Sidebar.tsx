import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils.ts';
import { Button } from '../ui/button.tsx';
import { Separator } from '../ui/separator.tsx';
import {
  Calendar,
  Users,
  UserCog,
  Stethoscope,
  Building2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: Calendar, label: 'Schedule' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/doctors', icon: Stethoscope, label: 'Doctors' },
  { to: '/services', icon: UserCog, label: 'Services' },
  { to: '/rooms', icon: Building2, label: 'Rooms' },
];

const navLinkClasses =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';
const navLinkActiveClasses = 'bg-blue-50 text-blue-700';
const navLinkInactiveClasses = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <span className="text-lg font-semibold text-gray-900">Clinic</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(collapsed && 'mx-auto')}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                navLinkClasses,
                isActive ? navLinkActiveClasses : navLinkInactiveClasses,
                collapsed && 'justify-center px-2',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-4">
        {!collapsed && (
          <p className="text-xs text-gray-400">
            Multi-Tenant Clinic Scheduler
          </p>
        )}
      </div>
    </aside>
  );
}
