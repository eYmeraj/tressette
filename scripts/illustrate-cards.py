"""Regenerates public/cards-illustrated/*.webp: the Piacentine deck as gold engravings on suit-coloured grounds.

Starts from the same public-domain scan as slice-cards.cjs (see CREDITS.md) and, for each card, removes the
print grain, maps the artwork's tones to a bronze-gold-cream ramp, engraves the linework in a dark tone of the
suit's ground (denari bronze, coppe crimson, bastoni green, spade navy) and frames it in a double gold rule.

Usage: pip install numpy opencv-python-headless
       python3 scripts/illustrate-cards.py <deck.jpg> public/cards public/cards-illustrated
Each card is located in the scan by matching it against the existing crop in public/cards.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

SUITS = ['denari', 'coppe', 'bastoni', 'spade']
CROP_W, CROP_H = 326, 592   # crop size slice-cards.cjs takes from the scan (frame + 26px outset)
FRAME_W, FRAME_H = 274, 540  # the printed black frame inside it
SCALE = 3                    # work at 3x the scan so smoothed edges stay crisp
OUT_W = 276                  # 3x the largest on-screen card
GROUNDS = {'denari': '#4a3312', 'coppe': '#5e1420', 'bastoni': '#173d26', 'spade': '#152a4d'}
GOLD, CREAM = '#d4a23c', '#f8eed6'


def bgr(hex_color):
    h = hex_color.lstrip('#')
    return np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], np.float32)


def locate(scan, card_png, row, col):
    """Find a card's full-resolution crop by template-matching the existing small crop in its grid cell."""
    H, W = scan.shape[:2]
    cw, ch = W / 10, H / 4
    t = cv2.imread(str(card_png))
    t = cv2.resize(t, (CROP_W, round(t.shape[0] * CROP_W / t.shape[1])), interpolation=cv2.INTER_CUBIC)
    x0, y0 = max(0, int(col * cw - 80)), max(0, int(row * ch - 80))
    x1, y1 = min(W, int((col + 1) * cw + 80)), min(H, int((row + 1) * ch + 80))
    _, score, _, (mx, my) = cv2.minMaxLoc(cv2.matchTemplate(scan[y0:y1, x0:x1], t, cv2.TM_CCOEFF_NORMED))
    if score < 0.9:
        print(f'{card_png.stem}: weak match ({score:.2f})')
    x, y = x0 + mx, y0 + my
    return scan[y:y + t.shape[0], x:x + t.shape[1]]


def find_frame(bgr):
    """The frame's left, right, top and bottom lines: the darkest pair of columns/rows spaced like the frame."""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    dark = (g < 120).astype(np.float32)
    cols, rows = dark[h // 4: 3 * h // 4].mean(0), dark[:, w // 4: 3 * w // 4].mean(1)

    def pair(prof, size):
        return max(((a, b) for a in range(8, 50) for b in range(a + size - 6, a + size + 7) if b < len(prof) - 4),
                   key=lambda ab: prof[ab[0]] + prof[ab[1]])

    (x0, x1), (y0, y1) = pair(cols, FRAME_W), pair(rows, FRAME_H)
    return x0, x1, y0, y1


def deskew(bgr):
    """Straighten cards that sit slightly crooked in the scan, using the slope of the frame's side lines."""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    slopes = []
    for xc in find_frame(bgr)[:2]:
        ys = np.arange(60, h - 60, 4)
        lo = max(0, xc - 10)
        xs = np.array([lo + np.argmin(g[y, lo: xc + 11]) for y in ys], np.float32)
        ok = np.abs(xs - np.median(xs)) < 6
        if ok.sum() > len(ys) * 0.6:
            slopes.append(np.polyfit(ys[ok], xs[ok], 1)[0])
    if not slopes:
        return bgr
    angle = -np.degrees(np.arctan(np.median(slopes)))
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1)
    return cv2.warpAffine(bgr, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def art_mask(img, frame):
    """Where the artwork is. Paper enclosed by the artwork (the eagle's circle, highlights) counts as art;
    only paper connected to the margin inside the frame becomes ground."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    m = ((lab[..., 0] < 222) | (chroma > 16)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    x0, x1, y0, y1 = frame
    pad = 4 * SCALE
    inside = np.zeros_like(m)
    inside[y0 + pad: y1 - pad, x0 + pad: x1 - pad] = 1
    _, cc = cv2.connectedComponents((1 - m * inside).astype(np.uint8), connectivity=4)
    margin = np.unique(np.concatenate([cc[0], cc[-1], cc[:, 0], cc[:, -1]]))
    art = (~np.isin(cc, margin)).astype(np.uint8)
    art = cv2.morphologyEx(art, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(art.astype(np.float32), (0, 0), 1.2)


def engrave_lines(img):
    """The scan's linework as even strokes (difference of Gaussians), with print specks dropped."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    dog = cv2.GaussianBlur(g, (0, 0), 2.0) - 0.98 * cv2.GaussianBlur(g, (0, 0), 2.0 * 1.6)
    ink = np.clip(-dog * 32, 0, 1)
    n, cc, stats, _ = cv2.connectedComponentsWithStats((ink > 0.4).astype(np.uint8), 8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 20 * SCALE * SCALE
    ink = cv2.GaussianBlur(ink * keep[cc], (0, 0), 1.2)
    return np.clip((ink - 0.3) * 3, 0, 1)


def illustrate(card_bgr, suit):
    card_bgr = deskew(card_bgr)
    h, w = card_bgr.shape[:2]
    frame = [v * SCALE for v in find_frame(card_bgr)]
    clean = cv2.fastNlMeansDenoisingColored(card_bgr, None, 9, 10, 7, 21)  # removes the halftone grain
    big = cv2.resize(clean, (w * SCALE, h * SCALE), interpolation=cv2.INTER_CUBIC)
    smooth = cv2.bilateralFilter(big, 11, 40, 9)       # tones: smooth, so faces don't posterise
    flat = cv2.pyrMeanShiftFiltering(big, 12, 20)      # lines: flattened, so only real edges remain

    ground, gold, cream = bgr(GROUNDS[suit]), bgr(GOLD), bgr(CREAM)
    L = cv2.GaussianBlur(cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32) / 255, (0, 0), 1.5)
    # Tone ramp: shadows deep bronze, mids gold, lights cream, with a smoothstep for soft transitions.
    t = np.clip((L - 0.12) / 0.83, 0, 1)
    t = (t * t * (3 - 2 * t))[..., None]
    deep = ground * 0.45 + gold * 0.35
    tone = np.where(t < 0.5, deep + (gold - deep) * (t / 0.5), gold + (cream - gold) * ((t - 0.5) / 0.5))
    art = art_mask(smooth, frame)[..., None]
    out = ground * (1 - art) + tone * art

    # Engraved lines in a dark shade of the ground, lighter across pale skin so faces stay clean.
    ink = (engrave_lines(flat) * np.clip(1.2 - L, 0.35, 1))[..., None] * art
    out = out * (1 - ink) + ground * 0.3 * ink

    x0, x1, y0, y1 = frame
    o = 6 * SCALE
    cv2.rectangle(out, (x0, y0), (x1, y1), gold.tolist(), 2 * SCALE, cv2.LINE_AA)
    cv2.rectangle(out, (x0 - o, y0 - o), (x1 + o, y1 + o), gold.tolist(), SCALE, cv2.LINE_AA)
    return cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (OUT_W, round(h * OUT_W / w)),
                      interpolation=cv2.INTER_AREA)


if __name__ == '__main__':
    scan_path, cards_dir, out_dir = sys.argv[1:4]
    scan = cv2.imread(scan_path)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for row, suit in enumerate(SUITS):
        for col in range(10):
            name = f'{col + 1}-{suit}'  # same as Card.id
            crop = locate(scan, Path(cards_dir) / f'{name}.webp', row, col)
            cv2.imwrite(f'{out_dir}/{name}.webp', illustrate(crop, suit), [cv2.IMWRITE_WEBP_QUALITY, 85])
            print(name, flush=True)
