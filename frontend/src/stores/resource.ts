import { defineStore } from "pinia";
import { resourceApi } from "@/api/resource";
import type { Resource, ShareInfoResponse, ShareInfo, ResourceItem } from "@/types";
import { ElMessage } from "element-plus";

interface StorageListObject {
  list: Resource[];
  lastUpdateTime?: string;
}

const lastResource = (
  localStorage.getItem("last_resource_list")
    ? JSON.parse(localStorage.getItem("last_resource_list") as string)
    : { list: [] }
) as StorageListObject;

interface RawCloudLinkItem {
  link?: string;
}

interface RawResourceItem extends Omit<ResourceItem, "cloudLinks"> {
  cloudLinks: Array<string | RawCloudLinkItem>;
}

interface RawResourceGroup extends Omit<Resource, "list"> {
  list: RawResourceItem[];
}

const normalizeCloudLinks = (cloudLinks: Array<string | RawCloudLinkItem> = []): string[] => {
  return cloudLinks
    .map((item) => (typeof item === "string" ? item : item.link || ""))
    .filter((item): item is string => Boolean(item));
};

const normalizeResources = (data: RawResourceGroup[] = []): Resource[] => {
  return data
    .filter((item) => item.list.length > 0)
    .map((group) => ({
      ...group,
      list: group.list.map((item) => ({
        ...item,
        cloudLinks: normalizeCloudLinks(item.cloudLinks),
        validationResult: item.validationResult,
        isSupportSave: false,
      })),
    }));
};

export const useResourceStore = defineStore("resource", {
  state: () => ({
    tagColor: {
      baiduPan: "primary",
      weiyun: "info",
      aliyun: "warning",
      pan115: "danger",
      quark: "success",
    },
    keyword: "",
    resources: lastResource.list,
    lastUpdateTime: lastResource.lastUpdateTime || "",
    shareInfo: {} as ShareInfoResponse,
    resourceSelect: [] as ShareInfo[],
    loading: false,
    backupPlan: false,
    loadTree: false,
  }),

  actions: {
    setLoadTree(loadTree: boolean) {
      this.loadTree = loadTree;
    },
    async searchResources(keyword?: string, isLoadMore = false, channelId?: string): Promise<void> {
      this.loading = true;
      if (!isLoadMore) this.resources = [];
      try {
        let lastMessageId = "";
        if (isLoadMore) {
          const list = this.resources.find((x) => x.id === channelId)?.list || [];
          lastMessageId = list[list.length - 1].messageId || "";
          if (list[list.length - 1].isLastMessage) {
            ElMessage.warning("没有更多了~");
            return;
          }
          if (!lastMessageId) {
            ElMessage.error("当次搜索源不支持加载更多");
            return;
          }
          keyword = this.keyword;
        }
        const response = await resourceApi.search(keyword || "", channelId, lastMessageId);
        let data = normalizeResources((response.data as RawResourceGroup[] | undefined) || []);
        this.keyword = keyword || "";
        if (isLoadMore) {
          const findedIndex = this.resources.findIndex((item) => item.id === data[0]?.id);
          if (findedIndex !== -1) {
            this.resources[findedIndex].list.push(...data[0].list);
          }
          if (data.length === 0) {
            const list = this.resources.find((item) => item.id === channelId)?.list;
            list && list[list.length - 1] && (list[list.length - 1]!.isLastMessage = true);
            ElMessage.warning("没有更多了~");
          }
        } else {
          this.resources = data.map((item, index) => ({ ...item, displayList: index === 0 }));
          if (!keyword) {
            // 获取当前时间字符串 用于存储到本地
            this.lastUpdateTime = new Date().toLocaleString();
            localStorage.setItem(
              "last_resource_list",
              JSON.stringify({ list: this.resources, lastUpdateTime: this.lastUpdateTime })
            );
          }
          if (this.resources.length === 0) {
            ElMessage.warning("未搜索到相关资源");
          }
        }
      } catch (error) {
        this.handleError("搜索失败，请重试", error);
      } finally {
        this.loading = false;
      }
    },

    async setSelectedResource(resourceSelect: ShareInfo[]) {
      this.resourceSelect = resourceSelect;
    },

    async saveResource(_resource: ResourceItem, _folderId: string): Promise<void> {
      ElMessage.warning("当前版本仅保留资源搜索功能");
    },

    async parsingCloudLink(_url: string): Promise<void> {
      ElMessage.warning("当前版本仅保留资源搜索功能");
    },

    async getResourceListAndSelect(_resource: ResourceItem): Promise<boolean> {
      this.setSelectedResource([]);
      ElMessage.warning("当前版本仅保留资源搜索功能");
      return false;
    },

    handleError(message: string, error: unknown): void {
      console.error(message, error);
      ElMessage.error(error instanceof Error ? error.message : message);
    },
  },
});
