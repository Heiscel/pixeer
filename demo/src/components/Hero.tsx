import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import DashboardPreview from './DashboardPreview';
import type { AppPage } from '../App';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4';

const gradientBg = [
  'radial-gradient(ellipse 80% 50% at 20% -10%, hsla(239, 84%, 67%, 0.12) 0%, transparent 60%)',
  'radial-gradient(ellipse 60% 40% at 80% 110%, hsla(239, 84%, 67%, 0.08) 0%, transparent 60%)',
  'linear-gradient(180deg, #f5f6ff 0%, #ffffff 60%)',
].join(', ');

const fadeUp = (delay = 0, y = 16) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: 'easeOut' as const },
});

export default function Hero({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      // autoplay blocked — gradient fallback already visible
    });
  }, []);

  return (
    <section className="relative flex-1 flex flex-col items-center overflow-hidden">
      {/* Gradient fallback — always visible */}
      <div className="absolute inset-0 z-0" style={{ background: gradientBg }} />

      {/* Background video */}
      <video
        ref={videoRef}
        src={VIDEO_URL}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        style={{ opacity: 0.55 }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full px-6 pt-10 md:pt-14">
        {/* Badge */}
        <motion.div {...fadeUp(0, 10)} className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground font-body">
            Now with AI agent support ✨
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          {...fadeUp(0.1)}
          className="text-center font-display text-5xl md:text-6xl lg:text-[5rem] leading-[0.95] tracking-tight text-foreground max-w-xl"
        >
          The Future of{' '}
          <em className="not-italic" style={{ fontStyle: 'italic' }}>
            Smarter
          </em>{' '}
          Automation
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          {...fadeUp(0.2)}
          className="mt-4 text-center text-base md:text-lg text-muted-foreground max-w-[650px] leading-relaxed font-body"
        >
          Automate your busywork with intelligent agents that learn, adapt, and
          execute—so your team can focus on what matters most.
        </motion.p>

        {/* CTA buttons */}
        <motion.div {...fadeUp(0.3)} className="mt-5 flex items-center gap-3">
          <button
            onClick={() => onNavigate('login')}
            className="rounded-full px-6 py-2.5 text-sm font-medium font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity duration-150"
          >
            Book a demo
          </button>
          <button
            onClick={() => onNavigate('login')}
            className="h-11 w-11 rounded-full border-0 flex items-center justify-center bg-background hover:bg-background/80 transition-colors duration-150"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
          >
            <Play className="h-4 w-4 fill-foreground text-foreground" />
          </button>
        </motion.div>

        {/* Dashboard preview */}
        <motion.div
          {...fadeUp(0.5, 30)}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' as const }}
          className="mt-8 w-full max-w-5xl"
        >
          <div
            className="rounded-2xl overflow-hidden p-3 md:p-4"
            style={{
              background: 'rgba(255, 255, 255, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              boxShadow: 'var(--shadow-dashboard)',
            }}
          >
            <DashboardPreview />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
