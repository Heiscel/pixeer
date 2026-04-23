import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X } from 'lucide-react';

export default function MotionSitesBadge() {
  const [visible, setVisible] = useState(true);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.4, delay: 1.2 }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border border-border bg-background px-4 py-2 shadow-sm font-body"
        >
          <span className="text-xs text-muted-foreground">
            Design from{' '}
            <a
              href="https://motionsites.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground font-medium hover:underline"
              style={{ pointerEvents: 'auto' }}
            >
              motionsites.ai
            </a>
          </span>
          <button
            onClick={() => setVisible(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            style={{ pointerEvents: 'auto' }}
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
