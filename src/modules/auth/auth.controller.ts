import type { FastifyReply, FastifyRequest } from "fastify";
import { authService } from "./auth.service";

export const authController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(authService.getPlaceholder());
  }
};
