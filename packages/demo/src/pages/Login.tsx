import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import type { AppPage } from '../App';

export default function LoginPage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [email, setEmail] = useState('jane@nexora.io');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const raw = email.split('@')[0] ?? 'Jane';
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      localStorage.setItem('pixeer_demo_user', name);
      onNavigate('dashboard');
    }, 700);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background font-body">
      <nav className="flex items-center gap-3 px-6 py-5">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-base font-semibold tracking-tight text-foreground">✦ Nexora</span>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Sign in to Nexora
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This is a live demo — any credentials will work.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 rounded-full py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Continue'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Powered by{' '}
              <a
                href="https://github.com/debowd/pixeer"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                Pixeer
              </a>
              {' '}— an open-source in-browser AI agent runtime
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
