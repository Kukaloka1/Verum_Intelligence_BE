import type { AuthPlaceholderResponse } from "./auth.types";

export const authService = {
  getPlaceholder(): AuthPlaceholderResponse {
    return {
      module: "auth",
      ready: false
    };
  }
};
