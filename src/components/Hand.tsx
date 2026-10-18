import { PointerEvent, useRef, useState } from 'react';
import { Card } from '../engine/cards';
import { CardView } from './Card';

/** How far above the hand a finger must be let go for the card to be played. */
const PLAY_LIFT_PX = 40;

interface HandProps {
  cards: Card[];
  legal: Set<string>;
  myTurn: boolean;
  /** Cards just drawn in the 2-player game, outlined because the opponent has seen them. */
  drawn: Set<string>;
  onPlay: (cardId: string) => void;
}

function cardAt(x: number, y: number): string | null {
  const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-card-id]');
  return slot?.dataset.cardId ?? null;
}

/**
 * The player's hand. With a mouse, hover lifts a card and a click plays it. With touch, a finger held on the
 * hand selects the card under it and can slide across the cards; letting go above the hand plays the card,
 * letting go on it keeps it selected, and tapping the selected card again plays it.
 */
export function Hand({ cards, legal, myTurn, drawn, onPlay }: HandProps) {
  const handRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useRef<{ id: string; wasSelected: boolean } | null>(null);
  // Set while the last interaction was touch, so the click the browser sends afterwards doesn't play a card.
  const touched = useRef(false);

  const current = selected && cards.some((c) => c.id === selected) ? selected : null;
  const playable = (id: string) => myTurn && legal.has(id);

  const play = (id: string) => {
    setSelected(null);
    onPlay(id);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    touched.current = e.pointerType !== 'mouse';
    if (!touched.current) return;
    const id = cardAt(e.clientX, e.clientY);
    if (!id) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id, wasSelected: id === current };
    setSelected(id);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const id = cardAt(e.clientX, e.clientY);
    if (id && id !== g.id) {
      gesture.current = { id, wasSelected: false };
      setSelected(id);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !playable(g.id)) return;
    const top = handRef.current!.getBoundingClientRect().top;
    if (e.clientY < top - PLAY_LIFT_PX || g.wasSelected) play(g.id);
  };

  return (
    <div
      ref={handRef}
      className="hand"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (gesture.current = null)}
      onClickCapture={(e) => {
        if (touched.current) e.stopPropagation();
      }}
      onKeyDownCapture={() => (touched.current = false)}
      // A long press is how cards are picked here; don't let it open the browser's context menu.
      onContextMenu={(e) => e.preventDefault()}
    >
      {current && playable(current) && <div className="hand-hint">Slide up or tap again to play</div>}
      {cards.map((c) => (
        // The slot holds still while the card inside lifts, so hovering never jumps between overlapping cards.
        <div key={c.id} data-card-id={c.id} className={c.id === current ? 'hand-slot selected' : 'hand-slot'}>
          <CardView
            layoutId={c.id}
            card={c}
            onClick={() => play(c.id)}
            playable={playable(c.id)}
            dimmed={myTurn && !legal.has(c.id)}
            className={drawn.has(c.id) ? 'shown' : undefined}
          />
        </div>
      ))}
    </div>
  );
}
