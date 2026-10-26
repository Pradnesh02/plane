/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TSemanticSearchResult = { id: string; sequence_id: number; name: string; score: number };

export class SemanticSearchService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async search(workspaceSlug: string, projectId: string, q: string, limit = 10): Promise<TSemanticSearchResult[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/semantic-search/`, {
      params: { q, limit },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
