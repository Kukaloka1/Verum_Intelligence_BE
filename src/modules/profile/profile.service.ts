import type { ProfilePlaceholderResponse } from "./profile.types";

export const profileService = {
  getPlaceholder(): ProfilePlaceholderResponse {
    return {
      module: "profile",
      ready: false
    };
  }
};
