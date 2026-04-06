/**
 * Hindi (transliterated) commentary templates.
 * Uses transliterated English for common cricket terms (boundary, wicket, etc.)
 * since cricket terminology is widely used in its English form in Hindi commentary.
 */

import type { CommentaryCategory, CommentaryTemplate } from './en';

export const templates: Record<CommentaryCategory, CommentaryTemplate[]> = {
  dot: [
    { full: '{over_ball} — Dot ball. Shandar bowling, batsman beat ho gaya.', short: 'Dot ball', emoji: '\u26AB' },
    { full: '{over_ball} — Acchi tarah defend kiya, bowler ko wapas.', short: 'Defended', emoji: '\uD83D\uDEE1\uFE0F' },
    { full: '{over_ball} — Koi run nahi. Good length delivery, chhod diya.', short: 'Koi run nahi' },
  ],
  runs: [
    { full: '{over_ball} — {runs} run liye. Score: {total}/{wickets}.', short: '{runs} run', emoji: '\uD83C\uDFC3' },
    { full: '{over_ball} — Gap mein daala, {runs} run. {total}/{wickets}.', short: '{runs} runs' },
  ],
  four: [
    { full: '{over_ball} — CHAUKAA! Zabardast shot, boundary tak gayi! {total}/{wickets}.', short: 'FOUR!', emoji: '4\uFE0F\u20E3\uD83D\uDD25' },
    { full: '{over_ball} — FOUR! Covers se nikal gayi, koi rok nahi paya.', short: 'FOUR! Covers se', emoji: '4\uFE0F\u20E3\uD83D\uDCA5' },
    { full: '{over_ball} — CHAUKAA! Khoobsurat drive, fielder ke paas se nikal gayi.', short: 'FOUR! Beautiful drive', emoji: '4\uFE0F\u20E3\u2728' },
  ],
  six: [
    { full: '{over_ball} — CHHAKKAA! Bada hit, stands mein gayi! {total}/{wickets}.', short: 'SIX!', emoji: '6\uFE0F\u20E3\uD83D\uDE80' },
    { full: '{over_ball} — CHHAKKAA! Stadium ke bahar! Kya shot hai!', short: 'SIX! Stadium ke bahar', emoji: '6\uFE0F\u20E3\uD83D\uDCAB' },
    { full: '{over_ball} — SIX! Long-on ke upar, zabardast hit!', short: 'SIX! Long-on ke upar', emoji: '6\uFE0F\u20E3\uD83C\uDFCF' },
  ],
  wicket: [
    { full: '{over_ball} — OUT! Wicket gir gaya! {total}/{wickets}.', short: 'OUT!', emoji: '\u274C\uD83C\uDFCF' },
    { full: '{over_ball} — WICKET! Bada breakthrough! {total}/{wickets}.', short: 'WICKET! Breakthrough', emoji: '\uD83C\uDFAF\u274C' },
    { full: '{over_ball} — Gaya! Partnership toot gayi. {total}/{wickets}.', short: 'WICKET! Partnership tooti', emoji: '\uD83D\uDC94\u274C' },
  ],
  wide: [
    { full: '{over_ball} — Wide ball. Extra run de diya.', short: 'Wide', emoji: '\u2194\uFE0F' },
    { full: '{over_ball} — Wide signal. Leg side pe nikal gayi.', short: 'Wide ball' },
  ],
  noball: [
    { full: '{over_ball} — No ball! Crease cross kar diya. Free hit aayegi!', short: 'No ball! Free hit', emoji: '\uD83D\uDEAB\uD83E\uDDB6' },
    { full: '{over_ball} — No ball. Front foot violation.', short: 'No ball' },
  ],
  extras: [
    { full: '{over_ball} — {runs} byes. Keeper ke paas se nikal gayi.', short: '{runs} byes', emoji: '\uD83D\uDC4B' },
    { full: '{over_ball} — {runs} leg byes. Pad se lagi.', short: '{runs} leg byes' },
  ],
};
