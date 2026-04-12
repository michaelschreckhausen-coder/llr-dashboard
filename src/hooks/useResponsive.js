import { useState, useEffect } from 'react'

export function useResponsive() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return {
    w,
    isDesktop:  w >= 1400,
    isLaptop:   w >= 1280 && w < 1400,
    isNotebook: w < 1280,
    isSmall:    w < 1100,
    isMobile:   w < 768,
    // Bequeme Shorthand-Werte
    pick: (...vals) => {
      // pick(desktop, laptop, notebook, small)
      if (w >= 1400) return vals[0]
      if (w >= 1280) return vals[1] ?? vals[0]
      if (w >= 1100) return vals[2] ?? vals[1] ?? vals[0]
      return vals[3] ?? vals[2] ?? vals[1] ?? vals[0]
    }
  }
}
