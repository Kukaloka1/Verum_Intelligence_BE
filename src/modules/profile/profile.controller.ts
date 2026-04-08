import type { FastifyReply, FastifyRequest } from "fastify";
import { profileService } from "./profile.service";

export const profileController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(profileService.getPlaceholder());
  }
};
