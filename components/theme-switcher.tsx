"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <div
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full cursor-pointer"
    >
      <motion.button
        className="relative flex items-center gap-3 w-32 h-10 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Icon Container - Stays in place and rotates */}
        <motion.div
          className="absolute w-6 h-6"
          animate={{
            rotate: isDark ? 360 : 0,
          }}
          transition={{
            duration: 0.5,
            ease: "easeInOut",
          }}
        >
          {isDark ? <Sun className="w-6 h-6 text-primary" /> : <Moon className="w-6 h-6 text-primary" />}
        </motion.div>

        {/* Text Container - Only fades */}
        <div className="ml-8">
          <AnimatePresence mode="wait">
            <motion.span
              key={isDark ? "light" : "dark"}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-medium text-primary"
            >
              {isDark ? "Clarear" : "Escurecer"}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.button></div>
  )
}

export default ThemeSwitcher

