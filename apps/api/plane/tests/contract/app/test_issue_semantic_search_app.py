# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item semantic search. The embedder service is replaced by a fake that
maps text onto a few keyword axes, so ranking, caching and failure handling are tested without a model."""

from uuid import uuid4

import pytest
import requests
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.views.issue import semantic_search
from plane.db.models import Issue, IssueEmbedding, Project, ProjectMember, User, Workspace, WorkspaceMember

AXES = [("login", "sign in", "password"), ("navbar", "menu", "header"), ("database", "query", "slow")]


class FakeEmbedder:
    def __init__(self):
        self.texts = []

    def __call__(self, texts, query=False):
        if not query:
            self.texts.extend(texts)
        return [[float(sum(text.lower().count(word) for word in axis)) + 0.01 for axis in AXES] for text in texts]


@pytest.fixture
def setup(db, monkeypatch):
    unique = uuid4().hex[:8]
    user = User.objects.create(email=f"u-{unique}@plane.so", username=f"u_{unique}")
    workspace = Workspace.objects.create(name="WS", owner=user, slug=f"ws-{unique}")
    project = Project.objects.create(name="Proj", identifier="PRJ", workspace=workspace, created_by=user)
    other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=user)
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=20)
    for p in (project, other):
        ProjectMember.objects.create(project=p, workspace=workspace, member=user, role=20)
    issues = {
        "login": Issue.objects.create(name="Users cannot sign in after password reset", project=project, workspace=workspace),
        "navbar": Issue.objects.create(name="Header menu overlaps on mobile", project=project, workspace=workspace),
        "db": Issue.objects.create(name="Dashboard query is slow", project=project, workspace=workspace),
    }
    Issue.objects.create(name="Login page in other project", project=other, workspace=workspace)
    fake = FakeEmbedder()
    monkeypatch.setattr(semantic_search, "embed", fake)
    client = APIClient()
    client.force_authenticate(user=user)
    url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/semantic-search/"
    return client, url, issues, fake


@pytest.mark.contract
def test_ranks_by_meaning_within_the_project(setup):
    client, url, issues, _ = setup
    response = client.get(url, {"q": "login broken"})
    assert response.status_code == status.HTTP_200_OK
    assert [r["id"] for r in response.data][0] == issues["login"].id
    assert len(response.data) == 3  # the other project's login item is not returned
    assert response.data[0]["score"] > response.data[-1]["score"]


@pytest.mark.contract
def test_embeddings_are_cached_and_refreshed_on_edit(setup):
    client, url, issues, fake = setup
    client.get(url, {"q": "menu"})
    assert len(fake.texts) == 3 and IssueEmbedding.objects.count() == 3
    client.get(url, {"q": "menu"})
    assert len(fake.texts) == 3  # nothing changed, nothing re-embedded
    issues["db"].name = "Database migrations fail"
    issues["db"].save()
    client.get(url, {"q": "menu"})
    assert len(fake.texts) == 4 and fake.texts[-1].startswith("Database migrations fail")


@pytest.mark.contract
def test_limit_and_validation(setup):
    client, url, _, _ = setup
    assert len(client.get(url, {"q": "slow", "limit": 1}).data) == 1
    assert client.get(url).status_code == status.HTTP_400_BAD_REQUEST
    assert client.get(url, {"q": "x", "limit": "many"}).status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
def test_embedder_down_returns_503(setup, monkeypatch):
    client, url, _, _ = setup

    def down(texts, query=False):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(semantic_search, "embed", down)
    response = client.get(url, {"q": "login"})
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
