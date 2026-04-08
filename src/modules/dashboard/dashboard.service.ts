import type { DashboardPlaceholderResponse } from "./dashboard.types";

export const dashboardService = {
  getPlaceholder(): DashboardPlaceholderResponse {
    return {
      module: "dashboard",
      ready: false
    };
  }
};
