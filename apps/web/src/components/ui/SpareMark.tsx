/**
 * The SPARE mark, drawn rather than imported.
 *
 * A gear for the parts, and two arrows circling inside it for the recovery loop — stock
 * comes off a machine, gets catalogued, and goes back out to another buyer. Vector so it
 * stays crisp at any size and takes its colours from props, which is what lets it sit
 * straight on the green header instead of needing a light chip behind it.
 */
export function SpareMark({
  className,
  gear = 'currentColor',
  accent = '#f5851f',
  title,
}: {
  className?: string;
  gear?: string;
  accent?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}

      {/* Twelve teeth: enough to read as machinery, few enough to survive at 20px. */}
      <path
        fill={gear}
        fillRule="evenodd"
        d="M 95.72 44.95 L 95.72 55.05 L 88.55 55.90 L 86.34 64.17 L 92.12 68.49 L 87.07 77.23 L 80.44 74.38 L 74.38 80.44 L 77.23 87.07 L 68.49 92.12 L 64.17 86.34 L 55.90 88.55 L 55.05 95.72 L 44.95 95.72 L 44.10 88.55 L 35.83 86.34 L 31.51 92.12 L 22.77 87.07 L 25.62 80.44 L 19.56 74.38 L 12.93 77.23 L 7.88 68.49 L 13.66 64.17 L 11.45 55.90 L 4.28 55.05 L 4.28 44.95 L 11.45 44.10 L 13.66 35.83 L 7.88 31.51 L 12.93 22.77 L 19.56 25.62 L 25.62 19.56 L 22.77 12.93 L 31.51 7.88 L 35.83 13.66 L 44.10 11.45 L 44.95 4.28 L 55.05 4.28 L 55.90 11.45 L 64.17 13.66 L 68.49 7.88 L 77.23 12.93 L 74.38 19.56 L 80.44 25.62 L 87.07 22.77 L 92.12 31.51 L 86.34 35.83 L 88.55 44.10 Z M 80.00 50.00 A 30.00 30.00 0 1 0 20.00 50.00 A 30.00 30.00 0 1 0 80.00 50.00 Z"
      />

      {/* One S, drawn as two halves that meet at the centre on a shared tangent, so it
          reads as a continuous letter rather than as two loose arrows. The S is both the
          initial and the way a recycling mark is drawn — a part goes out, value comes
          back. Stroked so the weight stays even through the curves. */}
      <g strokeWidth="11" strokeLinecap="butt" fill="none">
        {/* Upper bowl, heading out to a buyer. */}
        <path stroke={accent} d="M 50 50 C 43 48 34 45 34 38 C 34 29 47 25 58 30" />
        {/* Lower bowl, bringing the value back. */}
        <path stroke={gear} d="M 50 50 C 57 52 66 55 66 62 C 66 71 53 75 42 70" />
      </g>
      {/* Terminals, each aimed along its own curve's tangent. */}
      <path fill={accent} d="M 58 30 L 40.6 32 L 48.1 15.6 Z" />
      <path fill={gear} d="M 42 70 L 59.4 68 L 51.9 84.4 Z" />
    </svg>
  );
}
