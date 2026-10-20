# Who you're playing against

Every opponent in this game is a bot named after Endi at some stage of life. The stronger the bot, the later the
stage. This page explains how each one decides what to play, what it knows, and how strong it is.

## The short version

| Difficulty | Opponent | How it plays | Games | Thinking time |
|---|---|---|---|---|
| Easy | Baby Casino Endi | Fixed rules of thumb | 2 and 4 players | Instant |
| Medium | Cat Costume Endi | Imagines 24 ways the hidden cards could lie and plays what works best on average | 2 and 4 players | A blink |
| Hard | Chubby Endi | The same with 120 imagined deals, and perfect play once the deck runs out | 2 and 4 players | ~0.1 s |
| Expert | Uni Endi | A neural network that learned by playing itself | 2 players | Instant |
| Master | Habibi Endi | The neural network, checked by imagining 40 deals of the hidden cards | 2 players | Up to 0.8 s |

**None of them cheat.** Every bot gets exactly what a player at the table would know: its own hand, the cards
already played, cards shown face up (in the 2-player game, the cards drawn from the deck), accusi that were called,
and signals. It never sees your hand or the order of the deck. This is enforced in the code: bots receive a
`SeatView` (`src/engine/view.ts`), never the full game state, and a test checks that the neural network's input is
identical for two deals that look the same from its seat.

All the bots play their moves after a short pause so you can follow the game; the thinking happens in the
background during that pause.

## How strong they are

Measured by bots playing each other thousands of times. Each deal is played twice with the bots swapping seats, so
luck of the cards mostly cancels out. "Margin" is points per hand more than the opponent (a hand is worth 11
points), with a 95% confidence interval. 2-player games to 31, no accusi.

| Bot | Opponent | Games | Wins | Margin per hand |
|---|---|---|---|---|
| Expert (Uni Endi) | Easy (Baby Casino Endi) | 2000 | 99.9% | +3.54 ± 0.04 |
| Expert | Medium (Cat Costume Endi) | 800 | 99.8% | +3.42 ± 0.07 |
| Expert | Hard (Chubby Endi) | 400 | 86.2% | +1.29 ± 0.11 |
| Master (Habibi Endi) | Hard (Chubby Endi) | 400 | 89.2% | +1.44 ± 0.10 |

Even small margins add up: +1.4 points a hand turns a game to 31 into a clear win most of the time. Every
measurement is recorded in `ml/results.jsonl`.

## Easy: Baby Casino Endi

Plays by hand-written rules (`src/engine/bots/classic.ts`). It tracks which cards are still out there, so it knows
when one of its cards is the highest left in its suit (a "master" card).

- **Leading:** cashes a master Asso, or plays a master 3 or 2 to clear the way for its Asso; answers its partner's
  signals; otherwise leads from its longest suit, never a lone Asso, and avoids giving points to an opponent known
  to hold a higher card.
- **Following:** takes the trick when it's last to play, or when its card can't be beaten afterwards (with its Asso
  if it can, otherwise its cheapest winning card), or with its strongest card when the trick is worth a point or
  more; feeds points to a trick its partner is sure to win; otherwise throws its least valuable card.
- **Signals and accusi** (4-player): signals Busso, Volo and Striscio by simple rules, and always calls its accusi.

## Medium and Hard: Cat Costume and Chubby Endi

Both use the same method, **Monte Carlo sampling** (`src/engine/bots/stats.ts`). The only thing it can't see is
where the hidden cards are, so it imagines it:

1. **Deal the hidden cards at random**, but only in ways consistent with everything seen so far: cards already
   played are out, a player who didn't follow suit has no cards of that suit, cards drawn face up or shown in an
   accuso are where they were seen, and every hand has the right number of cards (`src/engine/bots/sample.ts`).
2. **Try every card it could play** in that imagined deal, and play the rest of the hand out, with every player
   following Baby Casino Endi's rules.
3. **Repeat** for many imagined deals, and play the card with the best average result (points its team takes minus
   points the other side takes, including the last-trick point).

Medium imagines 24 deals per move; Hard imagines 120. Hard also plays the **2-player endgame perfectly**: once the
deck is empty, every remaining card is known (whatever isn't in its hand is in yours), so it solves the rest of the
hand exactly by trying every line of play (`src/engine/bots/endgame.ts`).

Their weakness: the imagined deals are played out by the simple rule-based bot, so their estimates of what a card
is worth are only as good as Baby Casino Endi's play.

## Expert: Uni Endi (neural network)

A neural network that looks at the table and scores every card it could play. It plays the legal card with the
highest score, in one quick calculation, without imagining any deals.

### What it sees

The position, from its own seat, as 258 numbers (`src/engine/ml/encode.ts`):

| Input | Numbers | Meaning |
|---|---|---|
| Its hand | 40 | One per card of the deck: 1 if it holds it |
| Cards played earlier, by each player | 2 × 40 | Which cards each seat has already played |
| Cards on the table now, by each player | 2 × 40 | The current trick |
| Cards known to be in your hand | 40 | Cards you drew face up or showed in an accuso, not yet played |
| Suits you've shown you lack | 4 | You didn't follow suit when one was led |
| Suit led in this trick | 4 | |
| Position in the trick | 2 | Leading or answering |
| Winning this trick | 1 | Whether it currently holds the trick |
| Points taken this hand | 2 | Its and yours, as a share of the hand |
| Progress | 2 | Tricks played, cards left in the deck |
| Game score | 3 | Its score, yours, and the target |

Seats are counted from its own point of view, so the same network can play either seat.

### The network

A **multi-layer perceptron**: 258 inputs → 512 → 512 → 512 → 40 outputs, with ReLU between layers, about 680,000
weights. Each output is the network's estimate of how many more points (in thirds) its side will end the hand
with if it plays that card, compared with an average legal card. Illegal cards are ignored.

The weights are a 3.6 MB file (`src/engine/ml/weights-2p.json`) downloaded the first time you choose Expert or
Master. The calculation is plain TypeScript, with no machine-learning library in the browser
(`src/engine/ml/mlp.ts`); it skips inputs that are zero, which makes it several times faster.

### How it learned

It learned by imitation, then by improving on what it imitated ("expert iteration", the idea behind AlphaZero,
adapted to hidden cards):

1. **Copying Hard.** Hard played thousands of hands against itself; at every decision it recorded its score for
   every card. A first network learned to predict those scores.
2. **Teaching the search.** That network then replaced Baby Casino Endi's rules in Hard's imagined play-outs. Better
   play-outs give better estimates, so this search was stronger than Hard.
3. **Learning from the stronger search.** The new search played 4,000 hands against itself, a new network learned
   from its scores, and the cycle repeated. Each new network had to beat the previous best head to head before
   replacing it. Four cycles: the gains were +0.81, +0.23, +0.06 and +0.01 points per hand, so it stopped there.
4. **A bigger network** (512×3 instead of 256×2) trained on all four cycles' data (about 550,000 decisions) made
   the final Expert: +0.27 points per hand better than the last cycle's network.

Training details (`ml/train.py`, PyTorch):

- **Loss:** squared error between the network's scores and the teacher's, over legal cards only.
- **Suit symmetry:** the rules treat all four suits alike, so every position is shown with its suits randomly
  relabelled: 24 versions of each position for free. This was the single biggest improvement.
- **Relative scores:** it learns each card's score relative to the average legal card, because only the
  differences between cards matter for choosing one.
- AdamW optimiser, learning rate 0.001 with cosine decay, batches of 512, 40 epochs; the version that loses the
  least against the teacher on held-out games is kept.

Signals and accusi (only in 4-player, which Expert doesn't play) would follow Baby Casino Endi's rules.

## Master: Habibi Endi (neural network + search)

Master combines the two approaches: Hard's method of imagining deals, with the neural network doing the thinking
inside it (`src/engine/bots/neural.ts`).

1. The network scores every card, and Master keeps only the **3 most promising**.
2. It imagines **40 deals** of the hidden cards (consistent with everything seen, as for Hard).
3. In each deal it tries each of the 3 cards and **plays the hand out with the network** for both sides.
4. It plays the card with the best average result. Once the deck is empty it plays perfectly, like Hard.

It stops imagining after 0.8 s (and at least 12 deals), so it stays quick on slow phones; on a desktop it finishes
all 40 well within that.

## What they don't do (yet)

- **They play for the hand, not the game.** Every bot maximises its points in the current hand. Near the end of a
  game, a safer play that secures the win can be better than one that scores more; they don't weigh that.
- **They treat every possible deal as equally likely** (Medium, Hard, Master). A real player reads more into your
  plays: if you didn't take a trick when you could have, you probably don't hold the card that would have taken it.
- **Expert and Master only play 2-player games.** 4-player games use Easy, Medium or Hard.

More detail on the training pipeline, every experiment and its result is in `ml/README.md`.
