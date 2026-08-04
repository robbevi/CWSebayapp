// Iron Barn shelving is coded ROW-SHELF-DEPTH: rows are lettered, shelves run 1-5 bottom
// to top, and each shelf is 5 deep. So row A runs A-1-1 … A-5-5, then row B starts over.
//
// The whole grid is generated as type-ahead suggestions rather than hard-coded, and the
// field still accepts free text — the exact number of rows in use isn't fixed, so an
// unlisted code can always be typed rather than blocking the move.
const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SHELVES = [1, 2, 3, 4, 5];
const DEPTHS = [1, 2, 3, 4, 5];

export const IRON_BARN_BINS: string[] = ROWS.flatMap((row) =>
  SHELVES.flatMap((shelf) => DEPTHS.map((depth) => `${row}-${shelf}-${depth}`))
);
