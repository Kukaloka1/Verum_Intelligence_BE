import type { QueryPlaceholderResponse } from "./query.types";

export const queryService = {
  getPlaceholder(): QueryPlaceholderResponse {
    return {
      module: "query",
      ready: false
    };
  }
};
