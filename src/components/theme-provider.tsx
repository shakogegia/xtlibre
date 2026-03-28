"use client"

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme()
  return {
    theme: (theme ?? "system") as "light" | "dark" | "system",
    setTheme,
    resolvedTheme: (resolvedTheme ?? "light") as "light" | "dark",
  }
}
