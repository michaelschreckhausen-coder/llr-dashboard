// src/components/leads/LeadAvatar.jsx
import { memo, useMemo } from 'react';
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
}) {
  const palette = useMemo(
    () => getAvatarPalette(name || `${firstName || ''} ${lastName || ''}`),
    [name, firstName, lastName]
  );

  const initials = useMemo(
    () => getInitials(firstName, lastName) || (name ? name[0].toUpperCase() : '?'),
    [firstName, lastName, name]
  );

  const style = useMemo(
    () => ({
      ...baseStyle,
      ...sizeMap[size],
      background: palette.bg,
      color: palette.fg,
      border: ring ? '2px solid #ffffff' : 'none',
    }),
    [size, palette, ring]
  );

  return (
    <div style={style} aria-label={name || `${firstName} ${lastName}`}>
      {initials}
    </div>
  );
}

// memo: nur re-render wenn sich name/initials/size/ring ändern.
export const LeadAvatar = memo(LeadAvatarBase);
LeadAvatar.displayName = 'LeadAvatar';
