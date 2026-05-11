// src/components/leads/IcLinkedin.jsx
//
// Inline-SVG für das LinkedIn-Brand-Glyph — lokal gehalten weil
// lucide-react@1.14.0 (PR-2-Pin) keinen Linkedin-Export hat. Folgt
// dem IcXxx-Inline-SVG-Pattern aus Layout.jsx (zero-dep, brand-fidelity).
//
// Props matchen lucide-react-Konvention:
//   - size: pixel-width+height (default 16)
//   - color: stroke/fill (default 'currentColor')
//   - alle weiteren props (aria-*, style, etc.) durchgereicht

export function IcLinkedin({ size = 16, color = 'currentColor', ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
      {...rest}
    >
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}
