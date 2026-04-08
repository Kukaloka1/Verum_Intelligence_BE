import type { FastifyReply, FastifyRequest } from "fastify";
import { workspaceService } from "./workspace.service";

export const workspaceController = {
  async getPlaceholder(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(workspaceService.getPlaceholder());
  }
};
