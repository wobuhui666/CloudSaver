import request from "@/utils/request";
import type { Resource, LinkValidationResult } from "@/types/index";

export const resourceApi = {
  search(keyword: string, channelId?: string, lastMessageId?: string) {
    return request.get<Resource[]>(`/api/search`, {
      params: { keyword, channelId, lastMessageId },
    });
  },
  validateLink(url: string) {
    return request.get<LinkValidationResult>(`/api/link/validate`, {
      params: { url },
    });
  },
};
