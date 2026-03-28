import { SettingsContent } from '@/components/SettingsContent';

export function Settings() {
  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-6">
        <h2 className="text-lg font-bold text-accent-400">Settings</h2>
      </header>
      <SettingsContent />
    </div>
  );
}
