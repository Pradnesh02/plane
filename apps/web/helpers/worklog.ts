/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Parses "1h 30m", "1.5h", "90m", "2h" or a bare number of minutes ("45"). Returns minutes, or null if invalid. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) || null;
  const match = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const minutes = Math.round(Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
  return minutes > 0 ? minutes : null;
}

/** 90 -> "1h 30m", 120 -> "2h", 45 -> "45m", 0 -> "0m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
