import type { FastifyReply, FastifyRequest } from "fastify";
import { queryService } from "./query.service";

export const queryController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(queryService.getPlaceholder());
  }
};
