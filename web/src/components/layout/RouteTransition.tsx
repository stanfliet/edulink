"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Smooth routing transition wrapper — every dashboard route renders
 * inside this so navigation between role spaces glides cleanly.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1"
    >
      {children}
    </motion.main>
  );
}
