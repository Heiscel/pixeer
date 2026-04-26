import {
  Home,
  CheckSquare,
  ArrowLeftRight,
  CreditCard,
  TrendingUp,
  Landmark,
  ChevronRight,
  ChevronDown,
  Bell,
  Search,
  Plus,
  MoreHorizontal,
  Check,
} from 'lucide-react';

const accentHsl = 'hsl(239 84% 67%)';

function SidebarItem({
  icon: Icon,
  label,
  active,
  badge,
  chevron,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: string;
  chevron?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-default ${
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground'
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span className="flex-1 text-[11px] font-medium truncate">{label}</span>
      {badge && (
        <span className="text-[9px] bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
      {chevron && <ChevronRight className="w-2.5 h-2.5 shrink-0" />}
    </div>
  );
}

function ActionPill({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <button
      className={`rounded-full px-3 py-1 text-[10px] font-medium shrink-0 ${
        primary
          ? 'bg-accent text-accent-foreground'
          : 'bg-secondary text-secondary-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function AreaChart() {
  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="w-full h-20">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentHsl} stopOpacity="0.15" />
          <stop offset="100%" stopColor={accentHsl} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,65 C30,60 45,48 75,42 C105,36 115,52 150,44 C180,38 200,22 230,18 C255,14 275,22 300,16 L300,80 L0,80 Z"
        fill="url(#chartFill)"
      />
      <path
        d="M0,65 C30,60 45,48 75,42 C105,36 115,52 150,44 C180,38 200,22 230,18 C255,14 275,22 300,16"
        fill="none"
        stroke={accentHsl}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardPreview() {
  return (
    <div className="select-none pointer-events-none w-full flex flex-col text-[11px] font-body bg-background rounded-xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-foreground flex items-center justify-center">
            <span className="text-[9px] font-bold text-background">N</span>
          </div>
          <span className="text-[11px] font-semibold text-foreground">Nexora</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="flex-1 flex items-center gap-2 bg-secondary rounded-md px-2.5 py-1.5">
          <Search className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground flex-1">Search...</span>
          <span className="text-[9px] text-muted-foreground bg-background rounded px-1 py-0.5 border border-border">
            ⌘K
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button className="text-[10px] font-medium bg-accent text-accent-foreground rounded-full px-3 py-1">
            Move Money
          </button>
          <Bell className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
            <span className="text-[8px] font-semibold text-background">JB</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-40 shrink-0 border-r border-border bg-background px-2 py-3 flex flex-col gap-0.5">
          <SidebarItem icon={Home} label="Home" active />
          <SidebarItem icon={CheckSquare} label="Tasks" badge="10" />
          <SidebarItem icon={ArrowLeftRight} label="Transactions" />
          <SidebarItem icon={CreditCard} label="Payments" chevron />
          <SidebarItem icon={CreditCard} label="Cards" />
          <SidebarItem icon={TrendingUp} label="Capital" />
          <SidebarItem icon={Landmark} label="Accounts" chevron />

          <div className="mt-3 mb-1 px-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
              Workflows
            </span>
          </div>
          <SidebarItem icon={ArrowLeftRight} label="Trade routes" />
          <SidebarItem icon={CreditCard} label="Payments" />
          <SidebarItem icon={Bell} label="Notifications" />
          <SidebarItem icon={Home} label="Settings" />
        </div>

        {/* Main */}
        <div className="flex-1 bg-secondary/30 px-5 py-4 overflow-hidden flex flex-col gap-4">
          {/* Greeting + actions */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-foreground">Welcome, Jane</span>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionPill label="Send" primary />
              <ActionPill label="Request" />
              <ActionPill label="Transfer" />
              <ActionPill label="Deposit" />
              <ActionPill label="Pay Bill" />
              <ActionPill label="Create Invoice" />
              <span className="text-[10px] text-muted-foreground ml-1 cursor-default">
                Customize
              </span>
            </div>
          </div>

          {/* Cards row */}
          <div className="flex gap-3">
            {/* Balance card */}
            <div className="flex-1 basis-0 bg-background rounded-xl p-4 flex flex-col gap-2 border border-border">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Mercury Balance</span>
                <Check className="w-3 h-3 text-accent" />
              </div>
              <div>
                <span className="text-lg font-semibold text-foreground tracking-tight">
                  $8,450,190
                </span>
                <span className="text-xs text-muted-foreground">.32</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-muted-foreground">Last 30 Days</span>
                <span className="text-[10px] text-green-600 font-medium">+$1.8M</span>
                <span className="text-[10px] text-red-500 font-medium">−$900K</span>
              </div>
              <AreaChart />
            </div>

            {/* Accounts card */}
            <div className="flex-1 basis-0 bg-background rounded-xl p-4 flex flex-col border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-foreground">Accounts</span>
                <div className="flex items-center gap-1.5">
                  <Plus className="w-3 h-3 text-muted-foreground" />
                  <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                </div>
              </div>
              {[
                { label: 'Credit', amount: '$98,125.50' },
                { label: 'Treasury', amount: '$6,750,200.00' },
                { label: 'Operations', amount: '$1,592,864.82' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-3 border-t border-border first:border-t-0 text-xs"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-foreground">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Transactions table */}
          <div className="bg-background rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-[11px] font-semibold text-foreground">
                Recent Transactions
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-right px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { date: 'Apr 22', desc: 'AWS', amount: '−$5,200', status: 'Pending', color: 'text-amber-600 bg-amber-50' },
                  { date: 'Apr 21', desc: 'Client Payment', amount: '+$125,000', status: 'Completed', color: 'text-green-700 bg-green-50' },
                  { date: 'Apr 20', desc: 'Payroll', amount: '−$85,450', status: 'Completed', color: 'text-green-700 bg-green-50' },
                  { date: 'Apr 19', desc: 'Office Supplies', amount: '−$1,200', status: 'Completed', color: 'text-green-700 bg-green-50' },
                ].map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2.5 text-[10px] text-muted-foreground">{row.date}</td>
                    <td className="px-4 py-2.5 text-[10px] text-foreground">{row.desc}</td>
                    <td className="px-4 py-2.5 text-[10px] text-right font-medium text-foreground">{row.amount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[9px] font-medium rounded-full px-2 py-0.5 ${row.color}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
