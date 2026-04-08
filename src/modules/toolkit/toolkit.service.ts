import type { ToolkitPlaceholderResponse } from "./toolkit.types";

export const toolkitService = {
  getPlaceholder(): ToolkitPlaceholderResponse {
    return {
      module: "toolkit",
      ready: false
    };
  }
};
