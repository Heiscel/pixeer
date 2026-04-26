import type { AppPage } from '../App';

export default function Navbar({ onNavigate }: { onNavigate?: (page: AppPage) => void }) {
  return (
    <nav className="flex items-center justify-between px-6 md:px-12 lg:px-20 py-5 font-body relative z-20">
      <button
        onClick={() => onNavigate?.('landing')}
        className="text-xl font-semibold tracking-tight text-foreground select-none hover:opacity-80 transition-opacity"
      >
        ✦ Nexora
      </button>

      <div className="hidden md:flex items-center gap-8">
        {['Home', 'Pricing', 'About', 'Contact'].map((item) => (
          <a
            key={item}
            href="#"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            {item}
          </a>
        ))}
      </div>

      <button
        onClick={() => onNavigate?.('login')}
        className="rounded-full px-5 py-2 text-sm font-medium font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity duration-150"
      >
        Get started
      </button>
    </nav>
  );
}
