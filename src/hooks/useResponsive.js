import { useState, useEffect } from 'react'

export function useResponsive() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  // ── Semantische Geräte-Stufen (Mobile-Optimierung) ──────────────
  // mobile  : < 768   (Phones)
  // tablet  : 768–1024 (iPad Portrait/Landscape)
  // desktop : > 1024
  const isMobile = w < 768
  const isTablet = w >= 768 && w < 1024
  const isDesktopBp = w >= 1024
  const device = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'

  return {
    w,
    // ── Legacy-Stufen (Bestandscode, nicht ändern) ──────────────
    isDesktop:  w >= 1400,
    isLaptop:   w >= 1280 && w < 1400,
    isNotebook: w < 1280,
    isSmall:    w < 1100,
    isMobile,
    // ── Neue semantische Stufen ─────────────────────────────────
    isTablet,
    isDesktopBp,          // desktop nach neuer 1024-Grenze (kollidiert nicht mit legacy isDesktop)
    device,               // 'mobile' | 'tablet' | 'desktop'
    isTouch: isMobile || isTablet,
    // Bequeme Shorthand-Werte (Legacy)
    pick: (...vals) => {
      // pick(desktop, laptop, notebook, small)
      if (w >= 1400) return vals[0]
      if (w >= 1280) return vals[1] ?? vals[0]
      if (w >= 1100) return vals[2] ?? vals[1] ?? vals[0]
      return vals[3] ?? vals[2] ?? vals[1] ?? vals[0]
    },
    // Neuer semantischer Picker: pickBp(mobile, tablet, desktop)
    // tablet/desktop fallen auf den jeweils kleineren Wert zurück, wenn nicht angegeben.
    pickBp: (mobileVal, tabletVal, desktopVal) => {
      if (isMobile) return mobileVal
      if (isTablet) return tabletVal ?? mobileVal
      return desktopVal ?? tabletVal ?? mobileVal
    }
  }
}
