import { useState, useEffect } from 'react';
import { LayoutDashboard, ArrowRightLeft, CreditCard, Wallet, Landmark, TrendingUp, BarChart3, Tags, Sparkles, Settings as SettingsIcon, User, Building2, Upload } from 'lucide-react';
import { Dashboard } from '@/pages/Dashboard';
import { Transactions } from '@/pages/Transactions';
import { Cards } from '@/pages/Cards';
import { Benefits } from '@/pages/Benefits';
import { Loans } from '@/pages/Loans';
import { Investments } from '@/pages/Investments';
import { Reports } from '@/pages/Reports';
import { Categories } from '@/pages/Categories';
import { AICopilot } from '@/pages/AICopilot';
import { Settings } from '@/pages/Settings';
import { Import } from '@/pages/Import';
import { SecurityProvider, useSecurity } from '@/lib/security';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { AuthScreen } from '@/components/AuthScreen';
import { DateFilterProvider } from '@/lib/dateFilter';
import { processRecurringSeries } from '@/lib/recurrence';
import { computeDueAlerts, payDueAlertItem, type DueAlertSummary } from '@/lib/dueAlerts';
import { DueAlertsModal } from '@/components/DueAlertsModal';
import { supabase, type Account } from '@/lib/supabase';

type Page = 'dashboard' | 'transactions' | 'cards' | 'benefits' | 'loans' | 'investments' | 'reports' | 'categories' | 'ai' | 'settings' | 'import';

const allNavItems: { id: Page; label: string; icon: typeof LayoutDashboard; pfOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Extrato', icon: ArrowRightLeft },
  { id: 'cards', label: 'Cartões', icon: CreditCard },
  { id: 'benefits', label: 'VA/VR', icon: Wallet, pfOnly: true },
  { id: 'loans', label: 'Empréstimos', icon: Landmark },
  { id: 'investments', label: 'Investimentos', icon: TrendingUp },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'categories', label: 'Categorias', icon: Tags },
  { id: 'import', label: 'Importar', icon: Upload },
  { id: 'ai', label: 'Copiloto IA', icon: Sparkles },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
];

function ProfileSwitcher() {
  const { profile, setProfile, isPJ } = useProfile();

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#0a0a0b] border border-[#27272a]">
      <button
        onClick={() => setProfile('pf')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          !isPJ
            ? 'bg-[#10b981]/15 text-[#10b981]'
            : 'text-[#71717a] hover:text-white'
        }`}
      >
        <User size={13} />
        <span>PF</span>
      </button>
      <button
        onClick={() => setProfile('pj')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isPJ
            ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
            : 'text-[#71717a] hover:text-white'
        }`}
      >
        <Building2 size={13} />
        <span>PJ</span>
      </button>
    </div>
  );
}

function AppContent() {
  const { isAuthed, pin, resetActivity } = useSecurity();
  const { isPJ } = useProfile();
  const [page, setPage] = useState<Page>('dashboard');
  const [dueAlerts, setDueAlerts] = useState<DueAlertSummary | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertAccounts, setAlertAccounts] = useState<Account[]>([]);

  // Process recurring series and compute due alerts on app load
  useEffect(() => {
    const prof = isPJ ? 'pj' : 'pf';
    processRecurringSeries(prof).then(() => {
      Promise.all([
        computeDueAlerts(prof),
        supabase.from('accounts').select('*').eq('profile', prof).order('name'),
      ]).then(([summary, accRes]) => {
        setDueAlerts(summary);
        setAlertAccounts(accRes.data || []);
        if (summary.hasUrgent) setShowAlertModal(true);
      });
    });
  }, [isPJ]);

  // If switching to PJ while on a PF-only page, go to dashboard
  useEffect(() => {
    if (isPJ && page === 'benefits') setPage('dashboard');
  }, [isPJ, page]);

  // Reset activity timer on any user interaction
  useEffect(() => {
    if (!isAuthed) return;
    const handler = () => resetActivity();
    window.addEventListener('click', handler);
    window.addEventListener('touchstart', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [isAuthed, resetActivity]);

  // Show auth screen if PIN is set but not authed
  if (pin && !isAuthed) {
    return <AuthScreen />;
  }

  const navItems = allNavItems.filter(item => !item.pfOnly || !isPJ);

  function renderPage() {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={(p) => setPage(p as Page)} />;
      case 'transactions': return <Transactions />;
      case 'cards': return <Cards />;
      case 'benefits': return <Benefits />;
      case 'loans': return <Loans />;
      case 'investments': return <Investments />;
      case 'reports': return <Reports />;
      case 'categories': return <Categories />;
      case 'import': return <Import />;
      case 'ai': return <AICopilot />;
      case 'settings': return <Settings />;
      default: return <Dashboard onNavigate={(p) => setPage(p as Page)} />;
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-[#18181b] border-r border-[#27272a] flex-col z-40">
        <div className="p-5 border-b border-[#27272a]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#34d399] to-[#10b981] flex items-center justify-center font-bold text-white text-lg">
              R$
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-white">FinAI</h1>
              <p className="text-xs text-[#71717a]">{isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
            </div>
          </div>
          <div className="mt-3">
            <ProfileSwitcher />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                page === item.id
                  ? 'bg-[#10b981]/15 text-[#10b981]'
                  : 'text-[#a1a1aa] hover:text-white hover:bg-[#27272a]'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#18181b]/90 backdrop-blur-md border-b border-[#27272a]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#34d399] to-[#10b981] flex items-center justify-center font-bold text-white text-sm">
              R$
            </div>
            <h1 className="text-base font-bold text-white">FinAI</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <ProfileSwitcher />
            <button
              onClick={() => setPage('ai')}
              className={`p-2 rounded-lg transition-colors ${page === 'ai' ? 'bg-[#10b981]/15 text-[#10b981]' : 'text-[#a1a1aa]'}`}
            >
              <Sparkles size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:ml-64 pb-20 lg:pb-8">
        <div className="max-w-3xl mx-auto px-4 py-5 lg:px-8 lg:py-8">
          {renderPage()}
        </div>
      </main>

      <DueAlertsModal
        summary={showAlertModal ? dueAlerts : null}
        onClose={() => setShowAlertModal(false)}
        onNavigate={(p) => setPage(p as Page)}
        accounts={alertAccounts}
        onPaid={() => {
          const prof = isPJ ? 'pj' : 'pf';
          computeDueAlerts(prof).then(s => setDueAlerts(s));
          supabase.from('accounts').select('*').eq('profile', prof).order('name').then(r => setAlertAccounts(r.data || []));
        }}
      />

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#18181b]/95 backdrop-blur-md border-t border-[#27272a]">
        <div className="flex items-center justify-around px-1 py-1.5 overflow-x-auto no-scrollbar">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg flex-shrink-0 transition-colors ${
                page === item.id ? 'text-[#10b981]' : 'text-[#71717a]'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function App() {
  return (
    <SecurityProvider>
      <ProfileProvider>
        <DateFilterProvider>
          <AppContent />
        </DateFilterProvider>
      </ProfileProvider>
    </SecurityProvider>
  );
}

export default App;
