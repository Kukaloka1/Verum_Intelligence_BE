import type { WorkspacePlaceholderResponse } from "./workspace.types";

export const workspaceService = {
  getPlaceholder(): WorkspacePlaceholderResponse {
    return {
      module: "workspace",
      ready: false
    };
  }
};
