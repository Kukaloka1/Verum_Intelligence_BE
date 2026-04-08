import type { ComparisonPlaceholderResponse } from "./comparison.types";

export const comparisonService = {
  getPlaceholder(): ComparisonPlaceholderResponse {
    return {
      module: "comparison",
      ready: false
    };
  }
};
