import { closestCorners, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

// How the weekly board decides which card / day a dragged card is over.
//
// dnd-kit's closestCorners (what the board used on its own) compares the dragged card's corners with the corners of EVERY
// droppable on the board -- each card as well as each day column. A day holding many cards (the tasks of a whole week
// postponed onto one day, say) has dozens of cards whose corners sit closer to the dragged card than the target day's
// own, so a drop onto another day resolved to a card of the day it came from: the drag looked dead and the card never
// changed day.
//
// So the droppable under the POINTER wins (the card or the day the coach is actually pointing at); only when the pointer
// is over none of them (in the gap between columns, outside the board) does it fall back to closestCorners.
export const boardCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};
