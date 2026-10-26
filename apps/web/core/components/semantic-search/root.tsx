/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { SearchX, Sparkles } from "lucide-react";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useProject } from "@/hooks/store/use-project";
// services
import { SemanticSearchService } from "@/services/issue/semantic-search.service";

const semanticSearchService = new SemanticSearchService();
const EXAMPLES = ["users can't log in", "things that make the app slow", "mobile layout problems"];
// ponytail: results within this distance of the best score count as "best matches"; tuned by hand
// for bge-small (relevant ~0.5-0.75, noise ~0.4-0.55). Retune if the embedder model changes.
const MATCH_WINDOW = 0.1;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectSemanticSearchRoot = observer(function ProjectSemanticSearchRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { getProjectById } = useProject();
  const [query, setQuery] = useState("");
  const [showWeaker, setShowWeaker] = useState(false);
  const q = useDebounce(query.trim(), 350);

  const { data, error, isLoading } = useSWR(
    q ? `PROJECT_SEMANTIC_SEARCH_${projectId}_${q}` : null,
    () => semanticSearchService.search(workspaceSlug, projectId, q),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const identifier = getProjectById(projectId)?.identifier;
  const scores = (data ?? []).map((row) => row.score);
  const best = Math.max(...scores);
  const worst = Math.min(...scores);
  const strong = (data ?? []).filter((row) => row.score >= best - MATCH_WINDOW);
  const weaker = (data ?? []).slice(strong.length);
  const visible = showWeaker ? (data ?? []) : strong;
  // bars span weakest..strongest result so differences are visible (raw scores sit in a narrow band)
  const barWidth = (score: number) => (best > worst ? 12 + ((score - worst) / (best - worst)) * 88 : 100);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto px-page-x py-8">
      <div>
        <h2 className="text-h5-medium">Search by meaning</h2>
        <p className="text-body-xs-regular text-tertiary">
          Describe what you are looking for in your own words. Results match the idea, not just the exact words.
        </p>
      </div>

      <label className="flex items-center gap-2 rounded-lg border-[0.5px] border-subtle-1 bg-layer-2 px-3 focus-within:border-accent-strong">
        <Sparkles className="size-4 flex-shrink-0 text-accent-primary" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowWeaker(false);
          }}
          placeholder="e.g. users can't log in"
          aria-label="Search work items by meaning"
          data-testid="semantic-search-input"
          className="h-11 w-full bg-transparent text-body-sm-regular outline-none placeholder:text-placeholder"
        />
        {isLoading && <span className="text-caption-md-regular text-tertiary">Searching…</span>}
      </label>

      {!q && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="rounded-md border-[0.5px] border-subtle-1 px-2.5 py-1 text-caption-md-regular text-secondary hover:bg-layer-transparent-hover"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border-[0.5px] border-subtle-1 px-4 py-6 text-center text-body-xs-regular text-tertiary">
          {error?.error ?? "Search failed. Try again in a moment."}
        </div>
      )}

      {q && !error && data?.length === 0 && (
        <div className="py-12 text-center">
          <SearchX className="mx-auto mb-2 size-6 text-placeholder" />
          <div className="text-body-sm-medium">No work items in this project yet</div>
        </div>
      )}

      {q && !error && (data?.length ?? 0) > 0 && (
        <ul className="rounded-lg border-[0.5px] border-subtle-1" data-testid="semantic-search-results">
          {visible.map((row, index) => (
            <li
              key={`${q}-${row.id}`}
              className="worklog-in border-b border-subtle-1 last:border-b-0"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <Link
                href={`/${workspaceSlug}/browse/${identifier}-${row.sequence_id}/`}
                className="grid grid-cols-[96px_1fr_80px] items-center gap-3 px-4 py-2.5 text-body-xs-regular hover:bg-layer-transparent-hover"
              >
                <span className="text-tertiary tabular-nums">
                  {identifier}-{row.sequence_id}
                </span>
                <span className="truncate">{row.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-layer-3" title={`Relevance ${row.score}`}>
                  <span
                    className="worklog-bar block h-full rounded-full bg-accent-primary"
                    style={{ width: `${barWidth(row.score)}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
          {weaker.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowWeaker(!showWeaker)}
                data-testid="semantic-search-toggle-weaker"
                className="w-full px-4 py-2 text-left text-caption-md-regular text-tertiary hover:bg-layer-transparent-hover"
              >
                {showWeaker
                  ? "Hide weaker matches"
                  : `Show ${weaker.length} weaker ${weaker.length === 1 ? "match" : "matches"}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
});
