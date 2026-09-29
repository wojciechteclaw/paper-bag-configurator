import type { Dimensions } from '../../domain/types';

// Isometric bag outline with an open (empty) top; the arrow for `dimension` is highlighted.
// Front face = width × height, right face = depth × height.
const ARROWS: Record<keyof Dimensions, string> = {
  width: 'M6 48 L30 48',
  height: 'M2 18 L2 44',
  depth: 'M34 48 L44 40',
};

export function DimensionIcon({ dimension }: { dimension: keyof Dimensions }) {
  return (
    <svg className="dimension-icon" viewBox="0 0 48 52" width="40" height="44" aria-hidden="true">
      {/* opening (top is empty) */}
      <polygon points="6,18 30,18 40,10 16,10" className="dimension-icon__opening" />
      <polyline points="16,10 16,36 6,44" className="dimension-icon__hidden" />
      <line x1="16" y1="36" x2="40" y2="36" className="dimension-icon__hidden" />
      {/* right side and front */}
      <polygon points="30,18 40,10 40,36 30,44" className="dimension-icon__side" />
      <rect x="6" y="18" width="24" height="26" className="dimension-icon__front" />
      {(Object.keys(ARROWS) as (keyof Dimensions)[]).map((key) => (
        <path
          key={key}
          d={ARROWS[key]}
          className={key === dimension ? 'dimension-icon__arrow is-active' : 'dimension-icon__arrow'}
          markerStart="url(#dim-arrow)"
          markerEnd="url(#dim-arrow)"
        />
      ))}
      <defs>
        <marker id="dim-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  );
}
