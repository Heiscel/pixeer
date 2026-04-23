import { useState, useEffect, useRef } from 'react';
import {
  Home,
  CheckSquare,
  ArrowLeftRight,
  CreditCard,
  TrendingUp,
  Landmark,
  Bell,
  Search,
  Plus,
  Check,
  X,
  LogOut,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { createPixeerBridge } from '@pixeer/bridge';
import type { PixeerCallerTransport } from '@pixeer/types';
import { createInMemoryTransportPair } from '../lib/inMemoryTransport';
import PixeerSpotlight from '../components/PixeerSpotlight';
import type { AppPage } from '../App';

type SidebarTab = 'home' | 'tasks' | 'transactions' | 'payments' | 'cards' | 'capital' | 'accounts';
type Task = { id: string; text: string; done: boolean };

const INITIAL_TASKS: Task[] = [
  { id: '1', text: 'Review Q2 budget report', done: false },
  { id: '2', text: 'Schedule team standup', done: true },
  { id: '3', text: 'Approve pending invoices', done: false },
  { id: '4', text: 'Update payment gateway credentials', done: false },
  { id: '5', text: 'Send wire transfer to Acme Corp', done: false },
];

const accentHsl = 'hsl(239 84% 67%)';

function AreaChart() {
  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="w-full h-20">
      <defs>
        <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentHsl} stopOpacity="0.15" />
          <stop offset="100%" stopColor={accentHsl} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,65 C30,60 45,48 75,42 C105,36 115,52 150,44 C180,38 200,22 230,18 C255,14 275,22 300,16 L300,80 L0,80 Z"
        fill="url(#dashFill)"
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

function HomeView({ userName }: { userName: string }) {
  const transactions = [
    { date: 'Apr 22', desc: 'AWS Infrastructure', amount: '−$5,200', pos: false, status: 'Pending', pill: 'text-amber-600 bg-amber-50' },
    { date: 'Apr 21', desc: 'Client Payment – Acme Corp', amount: '+$125,000', pos: true, status: 'Completed', pill: 'text-green-700 bg-green-50' },
    { date: 'Apr 20', desc: 'Payroll – April', amount: '−$85,450', pos: false, status: 'Completed', pill: 'text-green-700 bg-green-50' },
    { date: 'Apr 19', desc: 'Office Supplies', amount: '−$1,200', pos: false, status: 'Completed', pill: 'text-green-700 bg-green-50' },
    { date: 'Apr 18', desc: 'SaaS Subscriptions', amount: '−$3,840', pos: false, status: 'Completed', pill: 'text-green-700 bg-green-50' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Welcome back, {userName}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with your account.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Balance card */}
        <div className="bg-background rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Mercury Balance</span>
              <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center">
                <Check className="w-2 h-2 text-accent" />
              </div>
            </div>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground cursor-pointer" />
          </div>
          <div className="mb-3">
            <span className="text-2xl font-semibold text-foreground tracking-tight">$8,450,190</span>
            <span className="text-sm text-muted-foreground">.32</span>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600 font-medium">+$1.8M</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-500 font-medium">−$900K</span>
            </div>
            <span className="text-xs text-muted-foreground">Last 30 days</span>
          </div>
          <AreaChart />
        </div>

        {/* Accounts card */}
        <div className="bg-background rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-foreground">Accounts</span>
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" />
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" />
            </div>
          </div>
          {[
            { label: 'Credit', amount: '$98,125.50', trend: '+2.1%', pos: true },
            { label: 'Treasury', amount: '$6,750,200.00', trend: '+8.4%', pos: true },
            { label: 'Operations', amount: '$1,592,864.82', trend: '−1.2%', pos: false },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-3 border-t border-border first:border-t-0">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">{row.amount}</div>
                <div className={`text-xs ${row.pos ? 'text-green-600' : 'text-red-500'}`}>{row.trend}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-background rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Recent Transactions</span>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Date</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Description</th>
                <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Amount</th>
                <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{row.date}</td>
                  <td className="px-5 py-3.5 text-sm text-foreground">{row.desc}</td>
                  <td className={`px-5 py-3.5 text-sm text-right font-medium whitespace-nowrap ${row.pos ? 'text-green-600' : 'text-foreground'}`}>
                    {row.amount}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap ${row.pill}`}>
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
  );
}

interface TasksViewProps {
  tasks: Task[];
  newTaskText: string;
  showNewTask: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onNewTaskChange: (text: string) => void;
  onNewTaskSubmit: () => void;
  onNewTaskCancel: () => void;
}

function TasksView({
  tasks,
  newTaskText,
  showNewTask,
  onToggle,
  onDelete,
  onAddClick,
  onNewTaskChange,
  onNewTaskSubmit,
  onNewTaskCancel,
}: TasksViewProps) {
  const pending = tasks.filter((t) => !t.done).length;
  const done = tasks.filter((t) => t.done).length;

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending} pending · {done} completed
          </p>
        </div>
        <button
          onClick={onAddClick}
          aria-label="New Task"
          className="flex items-center gap-1.5 text-sm font-medium bg-accent text-accent-foreground rounded-full px-4 py-2"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>

      {showNewTask && (
        <div className="mb-4 flex items-center gap-3 p-4 rounded-xl border-2 border-accent/30 bg-background shadow-sm">
          <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />
          <input
            autoFocus
            type="text"
            value={newTaskText}
            onChange={(e) => onNewTaskChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNewTaskSubmit();
              if (e.key === 'Escape') onNewTaskCancel();
            }}
            placeholder="Task name..."
            aria-label="Task name input"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={onNewTaskSubmit}
            aria-label="Add task"
            className="text-xs font-medium bg-accent text-accent-foreground rounded-full px-3.5 py-1.5 shrink-0"
          >
            Add
          </button>
          <button
            onClick={onNewTaskCancel}
            aria-label="Cancel new task"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`group flex items-center gap-3 p-4 rounded-xl bg-background border border-border transition-opacity ${
              task.done ? 'opacity-60' : ''
            }`}
          >
            <button
              onClick={() => onToggle(task.id)}
              aria-label={`Toggle task: ${task.text}`}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                task.done ? 'border-accent bg-accent' : 'border-border hover:border-accent'
              }`}
            >
              {task.done && <Check className="w-3 h-3 text-white" />}
            </button>
            <span
              className={`flex-1 text-sm text-foreground ${
                task.done ? 'line-through text-muted-foreground' : ''
              }`}
            >
              {task.text}
            </span>
            <button
              onClick={() => onDelete(task.id)}
              aria-label={`Delete task: ${task.text}`}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No tasks yet</p>
            <button
              onClick={onAddClick}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              Add your first task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [tab, setTab] = useState<SidebarTab>('home');
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [newTaskText, setNewTaskText] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const callerTransportRef = useRef<PixeerCallerTransport | null>(null);

  const userName = localStorage.getItem('pixeer_demo_user') ?? 'Jane';

  useEffect(() => {
    const { hostTransport, callerTransport } = createInMemoryTransportPair();
    const bridge = createPixeerBridge(hostTransport);
    callerTransportRef.current = callerTransport;
    return () => {
      bridge.dispose();
      callerTransport.dispose();
      callerTransportRef.current = null;
    };
  }, []);

  // Pixeer Spotlight navigates tabs via custom event
  useEffect(() => {
    function onPixeerNavigate(e: Event) {
      const detail = (e as CustomEvent<{ tab: SidebarTab }>).detail;
      if (detail?.tab) setTab(detail.tab);
    }
    window.addEventListener('pixeer:navigate', onPixeerNavigate);
    return () => window.removeEventListener('pixeer:navigate', onPixeerNavigate);
  }, []);

  function addTask() {
    const text = newTaskText.trim();
    if (!text) return;
    setTasks((prev) => [...prev, { id: Date.now().toString(), text, done: false }]);
    setNewTaskText('');
    setShowNewTask(false);
  }

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const sidebarItems: [SidebarTab, React.ElementType, string][] = [
    ['home', Home, 'Home'],
    ['tasks', CheckSquare, 'Tasks'],
    ['transactions', ArrowLeftRight, 'Transactions'],
    ['payments', CreditCard, 'Payments'],
    ['cards', CreditCard, 'Cards'],
    ['capital', TrendingUp, 'Capital'],
    ['accounts', Landmark, 'Accounts'],
  ];

  return (
    <div className="h-screen flex flex-col bg-background font-body overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded bg-foreground flex items-center justify-center">
            <span className="text-[10px] font-bold text-background">N</span>
          </div>
          <span className="text-sm font-semibold text-foreground">Nexora</span>
        </div>

        <div className="flex-1 max-w-sm flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 mx-4">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            aria-label="Search"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
          />
          <span className="text-[10px] text-muted-foreground bg-background rounded px-1.5 py-0.5 border border-border font-mono shrink-0">
            ⌘K
          </span>
        </div>

        <div className="flex items-center gap-3 ml-auto shrink-0">
          <button
            aria-label="Move Money"
            className="hidden sm:block text-xs font-medium bg-accent text-accent-foreground rounded-full px-3.5 py-1.5"
          >
            Move Money
          </button>
          <Bell className="w-4 h-4 text-muted-foreground" />
          <button
            onClick={() => onNavigate('landing')}
            aria-label="Sign out"
            className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <span className="text-[10px] font-semibold text-background">JB</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex w-52 shrink-0 border-r border-border bg-background px-2 py-4 flex-col gap-0.5 overflow-y-auto">
          {sidebarItems.map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-label={`Navigate to ${label}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                tab === id
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {id === 'tasks' && (
                <span className="text-[10px] bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 leading-none">
                  {tasks.filter((t) => !t.done).length}
                </span>
              )}
            </button>
          ))}

          <div className="mt-auto pt-4">
            <button
              onClick={() => onNavigate('landing')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 bg-secondary/30 overflow-y-auto">
          {tab === 'home' && <HomeView userName={userName} />}
          {tab === 'tasks' && (
            <TasksView
              tasks={tasks}
              newTaskText={newTaskText}
              showNewTask={showNewTask}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onAddClick={() => setShowNewTask(true)}
              onNewTaskChange={setNewTaskText}
              onNewTaskSubmit={addTask}
              onNewTaskCancel={() => {
                setShowNewTask(false);
                setNewTaskText('');
              }}
            />
          )}
          {tab !== 'home' && tab !== 'tasks' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-muted-foreground capitalize">{tab}</p>
                <p className="text-xs text-muted-foreground mt-1">Available in the full version</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <PixeerSpotlight callerTransportRef={callerTransportRef} />
    </div>
  );
}
