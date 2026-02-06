import { UserMenu } from './UserMenu.tsx';

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-xl font-semibold text-gray-900">Clinic Scheduler</h1>
      <UserMenu />
    </header>
  );
}
