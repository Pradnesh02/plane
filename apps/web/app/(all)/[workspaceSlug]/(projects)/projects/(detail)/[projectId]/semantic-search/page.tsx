/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { ProjectSemanticSearchRoot } from "@/components/semantic-search/root";
// hooks
import { useProject } from "@/hooks/store/use-project";

function ProjectSemanticSearchPage() {
  const { workspaceSlug, projectId } = useParams();
  const { currentProjectDetails } = useProject();

  if (!workspaceSlug || !projectId) return null;

  return (
    <>
      <PageHead title={currentProjectDetails?.name ? `${currentProjectDetails.name} - Smart search` : "Smart search"} />
      <ProjectSemanticSearchRoot workspaceSlug={workspaceSlug.toString()} projectId={projectId.toString()} />
    </>
  );
}

export default observer(ProjectSemanticSearchPage);
