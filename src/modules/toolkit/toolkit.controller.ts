import type { FastifyReply, FastifyRequest } from "fastify";
import { toolkitService } from "./toolkit.service";

export const toolkitController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(toolkitService.getPlaceholder());
  }
};
