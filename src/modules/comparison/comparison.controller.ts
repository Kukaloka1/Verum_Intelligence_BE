import type { FastifyReply, FastifyRequest } from "fastify";
import { comparisonService } from "./comparison.service";

export const comparisonController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(comparisonService.getPlaceholder());
  }
};
