import React from 'react';

export type CellDeltaSignIconProps = {
  className?: string;
  /** Pixel width/height; default 14 for grid delta glyphs */
  size?: number;
  /** Positive / negative when no variant */
  deltaPercent?: number;
  /** Saved-edit direction; overrides deltaPercent when set */
  variant?: 'increase' | 'decrease';
};

/**
 * Solid ▲ / ▼ triangles only: hot orange 60 (increase), palette blue 40 (decrease).
 * Use `deltaPercent` in the % badge, or `variant` after save (no % shown).
 */
export function CellDeltaSignIcon({
  deltaPercent,
  variant,
  className,
  size = 14,
}: CellDeltaSignIconProps) {
  const isIncrease =
    variant === 'increase'
      ? true
      : variant === 'decrease'
        ? false
        : (deltaPercent ?? 0) > 0;

  const cn = ['cell-delta-sign-icon', className].filter(Boolean).join(' ');

  if (isIncrease) {
    return (
      <svg
        className={cn}
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <polygon
          points="7,2.35 12.35,11.9 1.65,11.9"
          fill="var(--slds-g-color-palette-hot-orange-60)"
        />
      </svg>
    );
  }

  return (
    <svg
      className={cn}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <polygon
        points="7,11.65 1.65,2.1 12.35,2.1"
        fill="var(--slds-g-color-palette-blue-40)"
      />
    </svg>
  );
}
