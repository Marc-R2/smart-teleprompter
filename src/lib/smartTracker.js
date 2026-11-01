// Finds the place in the script that best fits what was just said.
//
// Word-by-word matching breaks as soon as the speaker rephrases, skips or goes
// back. Instead, every recognition result aligns the last few heard words
// against the WHOLE script (Smith-Waterman local alignment, with fuzzy word
// comparison and gaps on both sides) and picks the best end position.
//
// Identical passages get identical alignment scores, so three rules decide:
// - Distance: nearby places cost less, and going backwards costs extra.
// - Evidence: the further a jump, the more matched words it needs.
// - Confirmation: long jumps must hold up on the next word. A backward jump
//   that fits another place just as well is not taken until context settles it.

const HEARD_WINDOW = 16;
const SCORE_CAP = 6;
const GAP_HEARD = 0.25;
const GAP_SCRIPT = 0.3;
const SUBSTITUTION = 0.3;
const TAIL_MISS = 0.9;
const AMBIGUOUS_MARGIN = 0.4;
const SPAN_LENGTH = 8;
const SIMILARITY_CACHE_LIMIT = 200;

export function similarity(a, b) {
  if (a === b) return 1;
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 3) return 0;
  // Recognition often delivers a word while it is still being spoken.
  if (a.startsWith(b) || b.startsWith(a)) return Math.max(0.7, shorter / longer);
  if (longer - shorter > 3) return 0;
  const score = 1 - editDistance(a, b) / longer;
  return score >= 0.7 ? score : 0;
}

function editDistance(a, b) {
  let beforePrevious = null;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      if (
        beforePrevious &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current.push(value);
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

function distancePenalty(distance) {
  return distance >= 0
    ? Math.min(1.2, 0.012 * distance)
    : 0.5 + Math.min(1, 0.01 * -distance);
}

function hasEnoughEvidence(distance, candidate) {
  const { score, matched } = candidate;
  if (distance >= 1 && distance <= 3) return score >= 0.3;
  if (distance >= 4 && distance <= 10) return matched >= 2 || score >= 1.2;
  if (distance >= 11 && distance <= 40) return matched >= 2 && score >= 1.6;
  return matched >= 3 && score >= 2.4;
}

export function createSmartTracker(normalizedWords, skippable = []) {
  // Co-host and punctuation-only words are removed up front, so they cost
  // neither distance nor gap penalties, however long such a block is.
  const globalIndex = [];
  const vocabularyIds = new Map();
  const vocabulary = [];
  const scriptIds = [];
  const frequency = [];
  normalizedWords.forEach((word, index) => {
    if (!word || skippable[index]) return;
    let id = vocabularyIds.get(word);
    if (id === undefined) {
      id = vocabulary.length;
      vocabularyIds.set(word, id);
      vocabulary.push(word);
      frequency.push(0);
    }
    frequency[id] += 1;
    scriptIds.push(id);
    globalIndex.push(index);
  });

  const n = scriptIds.length;
  const maxFrequency = Math.max(1, ...frequency);
  // Rare words are stronger evidence than "und" or "the".
  const weights = vocabulary.map((word, id) => {
    const rarity = 1 - Math.log(frequency[id]) / Math.log(maxFrequency + 1);
    const weight = 0.4 + rarity;
    return word.length <= 2 ? Math.min(0.6, weight) : weight;
  });

  const similarityCache = new Map();
  const similarityRow = (token) => {
    let row = similarityCache.get(token);
    if (!row) {
      if (similarityCache.size >= SIMILARITY_CACHE_LIMIT) similarityCache.clear();
      row = new Float32Array(vocabulary.length).fill(-1);
      similarityCache.set(token, row);
    }
    return row;
  };

  const newRow = () => ({
    score: new Float32Array(n + 1),
    matched: new Int16Array(n + 1),
    start: new Int32Array(n + 1),
    last: new Int32Array(n + 1).fill(-1),
    miss: new Int16Array(n + 1),
  });
  const rows = [newRow(), newRow(), newRow()];

  let heardFinal = [];
  let position = -1;
  let pendingJump = null;

  const compressedPosition = () => {
    if (position < 0 || !n) return -1;
    let low = 0;
    let high = n - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (globalIndex[middle] <= position) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  };

  const align = (heard) => {
    let [older, previous, current] = rows;
    for (const row of [older, previous, current]) {
      row.score.fill(0);
      row.matched.fill(0);
      row.start.fill(-1);
      row.last.fill(-1);
      row.miss.fill(0);
    }

    for (let j = 0; j < heard.length; j++) {
      const token = heard[j];
      const tokenRow = similarityRow(token);
      const earlierToken = j > 0 ? heard[j - 1] : "";
      const joined = earlierToken + token;
      current.score[0] = 0;
      current.matched[0] = 0;
      current.start[0] = -1;
      current.last[0] = -1;
      current.miss[0] = 0;

      for (let i = 0; i < n; i++) {
        const id = scriptIds[i];
        let sim = tokenRow[id];
        if (sim < 0) {
          sim = similarity(token, vocabulary[id]);
          tokenRow[id] = sim;
        }

        let best = 0;
        let bestMatched = 0;
        let bestStart = -1;
        let bestLast = -1;
        let bestMiss = 0;

        if (sim > 0) {
          const value = previous.score[i] + weights[id] * sim;
          if (value > best) {
            best = value;
            bestMatched = previous.matched[i] + 1;
            bestStart = previous.start[i] >= 0 ? previous.start[i] : i;
            bestLast = i;
            bestMiss = 0;
          }
        } else if (previous.score[i] - SUBSTITUTION > best) {
          best = previous.score[i] - SUBSTITUTION;
          bestMatched = previous.matched[i];
          bestStart = previous.start[i];
          bestLast = previous.last[i];
          bestMiss = previous.miss[i] + 1;
        }

        // "smart mode" heard for "Smart-Mode" in the script.
        if (j > 0) {
          const word = vocabulary[id];
          if (
            joined.length >= 4 &&
            Math.abs(joined.length - word.length) <= 1 &&
            joined[0] === word[0] &&
            similarity(joined, word) >= 0.85
          ) {
            const value = older.score[i] + weights[id] * 1.2;
            if (value > best) {
              best = value;
              bestMatched = older.matched[i] + 2;
              bestStart = older.start[i] >= 0 ? older.start[i] : i;
              bestLast = i;
              bestMiss = 0;
            }
          }
        }

        // "Sprach eingabe" in the script for one heard word.
        if (i > 0) {
          const pair = vocabulary[scriptIds[i - 1]] + vocabulary[id];
          if (token.length >= 4 && token === pair) {
            const value = previous.score[i - 1] + weights[id] * 1.2;
            if (value > best) {
              best = value;
              bestMatched = previous.matched[i - 1] + 1;
              bestStart = previous.start[i - 1] >= 0 ? previous.start[i - 1] : i - 1;
              bestLast = i;
              bestMiss = 0;
            }
          }
        }

        if (previous.score[i + 1] - GAP_HEARD > best) {
          best = previous.score[i + 1] - GAP_HEARD;
          bestMatched = previous.matched[i + 1];
          bestStart = previous.start[i + 1];
          bestLast = previous.last[i + 1];
          bestMiss = previous.miss[i + 1] + 1;
        }
        if (current.score[i] - GAP_SCRIPT > best) {
          best = current.score[i] - GAP_SCRIPT;
          bestMatched = current.matched[i];
          // Skipped words split the span, so they are not marked as read.
          bestStart = -1;
          bestLast = current.last[i];
          bestMiss = current.miss[i];
        }

        current.score[i + 1] = best;
        current.matched[i + 1] = bestMatched;
        current.start[i + 1] = bestStart;
        current.last[i + 1] = bestLast;
        current.miss[i + 1] = bestMiss;
      }

      const recycled = older;
      older = previous;
      previous = current;
      current = recycled;
    }
    return previous;
  };

  const collectCandidates = (row, from) => {
    const candidates = [];
    for (let i = 0; i < n; i++) {
      // Rows ending in a skipped script word are weaker copies of their match.
      if (row.last[i + 1] !== i || row.score[i + 1] <= 0) continue;
      const score = row.score[i + 1];
      const distance = from < 0 ? i + 1 : i - from;
      candidates.push({
        at: i,
        distance,
        score,
        matched: row.matched[i + 1],
        start: row.start[i + 1],
        effective:
          Math.min(score, SCORE_CAP) +
          0.05 * score -
          distancePenalty(distance) -
          row.miss[i + 1] * TAIL_MISS,
      });
    }
    return candidates;
  };

  const accept = (candidate) => {
    pendingJump = null;
    position = globalIndex[candidate.at];
    return {
      index: position,
      spanStart:
        globalIndex[Math.max(candidate.start, candidate.at - SPAN_LENGTH + 1)],
    };
  };

  return {
    // Feed one recognition result. Returns the new place, or null to stay put.
    update(finalTokens = [], interimTokens = []) {
      if (finalTokens.length) {
        heardFinal = [...heardFinal, ...finalTokens].slice(-HEARD_WINDOW);
      }
      const heard = [...heardFinal, ...interimTokens].slice(-HEARD_WINDOW);
      if (!heard.length || !n) return null;

      const from = compressedPosition();
      const row = align(heard);
      const candidates = collectCandidates(row, from);
      if (!candidates.length) return null;

      let best = candidates[0];
      for (const candidate of candidates) {
        if (candidate.effective > best.effective) best = candidate;
      }

      // Recognition rewrites its last words, so tiny steps back are noise.
      if (best.distance <= 0 && best.distance >= -3) {
        pendingJump = null;
        return null;
      }
      if (!hasEnoughEvidence(best.distance, best)) return null;

      const isLongJump = best.distance < 0 || best.distance > 40;
      if (!isLongJump) return accept(best);

      const ambiguous = candidates.some(
        (other) =>
          other !== best &&
          Math.abs(other.at - best.at) > 8 &&
          other.effective >= best.effective - AMBIGUOUS_MARGIN
      );
      if (ambiguous && best.distance < 0) {
        pendingJump = null;
        return null;
      }

      const confirmed =
        pendingJump &&
        best.at > pendingJump.at &&
        best.at <= pendingJump.at + 6;
      if (confirmed || (best.matched >= 5 && !ambiguous)) {
        return accept(best);
      }
      if (!pendingJump || best.at > pendingJump.at + 6 || best.at < pendingJump.at) {
        pendingJump = { at: best.at };
      }
      return null;
    },

    // Keep in sync with the app's position, e.g. after auto-scroll.
    setPosition(index) {
      position = index;
    },

    // Forget what was heard, e.g. after the user clicked somewhere else.
    clearHeard() {
      heardFinal = [];
      pendingJump = null;
    },
  };
}
