import type { FastifyReply, FastifyRequest } from "fastify";
import { dashboardService } from "./dashboard.service";

export const dashboardController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(dashboardService.getPlaceholder());
  }
};
