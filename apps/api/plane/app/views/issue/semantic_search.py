# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import math
import os

# Third Party imports
import requests
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import Issue, IssueEmbedding

EMBEDDER_URL = os.environ.get("EMBEDDER_URL", "http://embedder:8000")
BATCH = 64


def embed(texts, query=False):
    """Vectors for `texts` from the embedder service (apps/embedder)."""
    response = requests.post(f"{EMBEDDER_URL}/embed", json={"texts": texts, "query": query}, timeout=120)
    response.raise_for_status()
    return response.json()["vectors"]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


class ProjectIssueSemanticSearchEndpoint(BaseAPIView):
    """Work items ranked by meaning, not keywords (?q=...&limit=10).

    Items are embedded lazily: anything new or edited since its last embedding is embedded
    on the next search, so there are no background jobs to keep in sync."""

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response({"error": "q is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            limit = max(1, min(int(request.query_params.get("limit", 10)), 50))
        except ValueError:
            return Response({"error": "limit must be a number"}, status=status.HTTP_400_BAD_REQUEST)

        issues = list(
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id).only(
                "id", "name", "sequence_id", "description_stripped"
            )
        )
        cached = {e.issue_id: e for e in IssueEmbedding.objects.filter(issue_id__in=[i.id for i in issues])}

        try:
            stale = []
            for issue in issues:
                text = f"{issue.name}\n{issue.description_stripped or ''}"[:2000]
                digest = hashlib.sha256(text.encode()).hexdigest()
                if issue.id not in cached or cached[issue.id].content_hash != digest:
                    stale.append(IssueEmbedding(issue_id=issue.id, content_hash=digest, vector=None))
                    stale[-1].text = text
            for start in range(0, len(stale), BATCH):
                batch = stale[start : start + BATCH]
                for row, vector in zip(batch, embed([row.text for row in batch])):
                    row.vector = vector
            IssueEmbedding.objects.bulk_create(
                stale, update_conflicts=True, unique_fields=["issue"], update_fields=["content_hash", "vector"]
            )
            cached.update({row.issue_id: row for row in stale})
            query_vector = embed([query], query=True)[0]
        except requests.RequestException:
            return Response(
                {"error": "Semantic search is unavailable: the embedder service is not reachable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # ponytail: brute-force cosine over the whole project in Python; fine for thousands of
        # items, move to pgvector with an index if projects reach tens of thousands.
        ranked = sorted(
            ((cosine(query_vector, cached[i.id].vector), i) for i in issues), key=lambda pair: pair[0], reverse=True
        )[:limit]
        return Response(
            [
                {"id": issue.id, "sequence_id": issue.sequence_id, "name": issue.name, "score": round(score, 3)}
                for score, issue in ranked
            ],
            status=status.HTTP_200_OK,
        )
