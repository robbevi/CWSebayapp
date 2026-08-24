/**
 * The SPARE mark.
 *
 * A gear ring holding an S built from warehouse racking — three shelves and two risers,
 * with the middle shelf picked out in the accent. Parts, on a shelf, inside the machinery
 * they came off.
 *
 * The S is drawn in straight lines at a single weight, which is what lets it survive being
 * shrunk: the earlier curved letterform thickened into a blur before favicon size.
 *
 * Colours come from props rather than being baked in, so the mark sits straight on the
 * green header, on white, and in dark mode without a light chip propping it up.
 */

// Three shelves at 27 / 44.5 / 62, risers closing the S on alternating sides.
const SHELF = { x: 28, w: 44, h: 11, r: 2.5 };
const RISER_H = 28.5;

const GEAR =
  'M 95.80 45.67 L 95.80 54.33 L 89.66 55.19 L 87.99 62.53 L 93.14 65.97 L 89.38 73.77 L 83.48 71.89 ' +
  'L 78.79 77.77 L 81.94 83.11 L 75.17 88.50 L 70.67 84.25 L 63.89 87.51 L 64.41 93.68 L 55.97 95.61 ' +
  'L 53.76 89.82 L 46.24 89.82 L 44.03 95.61 L 35.59 93.68 L 36.11 87.51 L 29.33 84.25 L 24.83 88.50 ' +
  'L 18.06 83.11 L 21.21 77.77 L 16.52 71.89 L 10.62 73.77 L 6.86 65.97 L 12.01 62.53 L 10.34 55.19 ' +
  'L 4.20 54.33 L 4.20 45.67 L 10.34 44.81 L 12.01 37.47 L 6.86 34.03 L 10.62 26.23 L 16.52 28.11 ' +
  'L 21.21 22.23 L 18.06 16.89 L 24.83 11.50 L 29.33 15.75 L 36.11 12.49 L 35.59 6.32 L 44.03 4.39 ' +
  'L 46.24 10.18 L 53.76 10.18 L 55.97 4.39 L 64.41 6.32 L 63.89 12.49 L 70.67 15.75 L 75.17 11.50 ' +
  'L 81.94 16.89 L 78.79 22.23 L 83.48 28.11 L 89.38 26.23 L 93.14 34.03 L 87.99 37.47 L 89.66 44.81 Z ' +
  // Second circle wound the same way, punched out by evenodd to leave a ring.
  'M 84.00 50.00 A 34.00 34.00 0 1 0 16.00 50.00 A 34.00 34.00 0 1 0 84.00 50.00 Z';

export function SpareMark({
  className,
  frame = 'currentColor',
  accent = '#f5851f',
  title,
}: {
  className?: string;
  /** The gear and the shelves. */
  frame?: string;
  /** The middle shelf. */
  accent?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}

      <path fill={frame} fillRule="evenodd" d={GEAR} />

      <g fill={frame}>
        <rect x={SHELF.x} y={27} width={SHELF.w} height={SHELF.h} rx={SHELF.r} />
        <rect x={SHELF.x} y={62} width={SHELF.w} height={SHELF.h} rx={SHELF.r} />
        {/* Risers are what turn three parallel shelves into a letter. */}
        <rect x={SHELF.x} y={27} width={SHELF.h} height={RISER_H} rx={SHELF.r} />
        <rect x={SHELF.x + SHELF.w - SHELF.h} y={44.5} width={SHELF.h} height={RISER_H} rx={SHELF.r} />
      </g>

      {/* Middle shelf last, so it reads as the one carrying stock. */}
      <rect x={SHELF.x} y={44.5} width={SHELF.w} height={SHELF.h} rx={SHELF.r} fill={accent} />
    </svg>
  );
}
