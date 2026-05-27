// src/components/leads/LeadAvatar.jsx
import { memo, useMemo, useState, useEffect } from 'react';
import { getAvatarPalette, getInitials } from '../../lib/leadHelpers';

// Static style fragments — stable references, kein neues Objekt pro Render.
const baseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  fontWeight: 500,
  flexShrink: 0,
  userSelect: 'none',
  overflow: 'hidden',
};

const sizeMap = {
  xs: { width: 22, height: 22, fontSize: 10 },
  sm: { width: 28, height: 28, fontSize: 11 },
  md: { width: 36, height: 36, fontSize: 13 },
  lg: { width: 44, height: 44, fontSize: 16 },
  xl: { width: 56, height: 56, fontSize: 20 },
};

function LeadAvatarBase({
  name,
  firstName,
  lastName,
  size = 'md',
  ring = false,
  imageUrl,     // optional — wenn vorhanden und ladbar, statt Initials.
}) {
  const [imgFailed, setImgFailed] = useState(false);

  // Image-Fail-State zurücksetzen, wenn imageUrl wechselt (z.B. nach LinkedIn-Sync)
  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const palette = useMemo(
    () => getAvatarPalette(name || `${firstName || ''} ${lastName || ''}`),
    [name, firstName, lastName]
  );

  const initials = useMemo(
    () => getInitials(firstName, lastName) || (name ? name[0].toUpperCase() : '?'),
    [firstName, lastName, name]
  );

  const dims = sizeMap[size];

  const style = useMemo(
    () => ({
      ...baseStyle,
      ...dims,
      background: palette.bg,
      color: palette.fg,
      border: ring ? '2px solid #ffffff' : 'none',
    }),
    [dims, palette, ring]
  );

  const ariaLabel = name || `${firstName || ''} ${lastName || ''}`.trim() || 'Avatar';
  const showImage = imageUrl && !imgFailed;

  return (
    <div style={style} aria-label={ariaLabel}>
      {showImage ? (
        <img
          src={imageUrl}
          alt={ariaLabel}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgFailed(true)}
          loading="lazy"
        />
      ) : (
        initials
      )}
    </div>
  );
}

// memo: nur re-render wenn sich name/initials/size/ring/imageUrl ändern.
export const LeadAvatar = memo(LeadAvatarBase);
LeadAvatar.displayName = 'LeadAvatar';
