<template>
  <div class="search-page">
    <header class="search-page__hero">
      <div class="hero__content">
        <p class="hero__eyebrow">CloudSaver Search</p>
        <h1>只保留资源搜索的轻量版本</h1>
        <p class="hero__description">
          面向 `cloud189-auto-save` 的兼容接口保留不变，网页端聚焦 Telegram 频道与雷鲸小站资源检索。
        </p>
      </div>
      <el-button class="hero__logout" plain @click="logout">退出登录</el-button>
    </header>

    <section class="search-panel">
      <el-input
        v-model="keyword"
        class="search-panel__input"
        placeholder="输入关键字搜索，留空可拉取最新资源"
        clearable
        @keyup.enter="handleSearch"
      />
      <div class="search-panel__actions">
        <el-button type="primary" :loading="resourceStore.loading" @click="handleSearch">
          搜索资源
        </el-button>
        <el-button :loading="resourceStore.loading" @click="loadLatest">最新资源</el-button>
      </div>
    </section>

    <section class="search-meta">
      <span>关键词：{{ resourceStore.keyword || "最新" }}</span>
      <span>上次刷新：{{ resourceStore.lastUpdateTime || "暂无" }}</span>
    </section>

    <section v-if="resourceStore.resources.length" class="result-groups">
      <article
        v-for="group in resourceStore.resources"
        :key="group.id"
        class="result-group"
      >
        <header class="result-group__header">
          <div>
            <h2>{{ group.channelInfo.name }}</h2>
            <p>{{ group.list.length }} 条结果</p>
          </div>
          <el-button v-if="group.supportsLoadMore !== false" text @click="loadMore(group.id)">
            加载更多
          </el-button>
        </header>

        <div class="result-group__list">
          <article
            v-for="resource in group.list"
            :key="`${group.id}-${resource.messageId}-${resource.cloudLinks[0]}`"
            class="resource-card"
          >
            <div class="resource-card__body">
              <div class="resource-card__meta">
                <span class="meta__type">{{ resource.cloudType || "未知来源" }}</span>
                <span>{{ formatDate(resource.pubDate) }}</span>
              </div>
              <h3>{{ resource.title || "未命名资源" }}</h3>
              <p v-if="resource.content" class="resource-card__content">
                {{ resource.content }}
              </p>
              <div v-if="resource.tags?.length" class="resource-card__tags">
                <span v-for="tag in resource.tags" :key="tag">{{ tag }}</span>
              </div>
              <div v-if="resource.sourceName || resource.articleUrl" class="resource-card__source">
                <span v-if="resource.sourceName">来源：{{ resource.sourceName }}</span>
                <a
                  v-if="resource.articleUrl"
                  :href="resource.articleUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看帖子
                </a>
              </div>
            </div>

            <footer class="resource-card__footer">
              <el-button type="primary" link @click="openLink(resource)">打开链接</el-button>
              <el-button link @click="copyLink(resource)">复制链接</el-button>
            </footer>
          </article>
        </div>
      </article>
    </section>

    <section v-else class="empty-state">
      <el-empty description="还没有搜索结果">
        <el-button type="primary" @click="loadLatest">查看最新资源</el-button>
      </el-empty>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { useResourceStore } from "@/stores/resource";
import { STORAGE_KEYS } from "@/constants/storage";
import type { ResourceItem } from "@/types";

const router = useRouter();
const resourceStore = useResourceStore();

const keyword = computed({
  get: () => resourceStore.keyword,
  set: (value: string) => {
    resourceStore.keyword = value;
  },
});

const handleSearch = async () => {
  await resourceStore.searchResources(keyword.value.trim(), false);
};

const loadLatest = async () => {
  keyword.value = "";
  await resourceStore.searchResources("", false);
};

const loadMore = async (channelId: string) => {
  await resourceStore.searchResources(resourceStore.keyword, true, channelId);
};

const getPrimaryLink = (resource: ResourceItem) => {
  return resource.cloudLinks[0] || resource.articleUrl || "";
};

const openLink = (resource: ResourceItem) => {
  const link = getPrimaryLink(resource);
  if (!link) {
    ElMessage.warning("当前资源没有可用链接");
    return;
  }
  window.open(link, "_blank");
};

const copyLink = async (resource: ResourceItem) => {
  const link = getPrimaryLink(resource);
  if (!link) {
    ElMessage.warning("当前资源没有可用链接");
    return;
  }
  await navigator.clipboard.writeText(link);
  ElMessage.success("链接已复制");
};

const logout = async () => {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  await router.replace("/login");
};

const formatDate = (value?: string) => {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
};
</script>

<style scoped lang="scss">
.search-page {
  min-height: 100vh;
  padding: 24px;
  color: #1c2434;
  background:
    radial-gradient(circle at top left, rgba(249, 193, 112, 0.28), transparent 32%),
    radial-gradient(circle at top right, rgba(89, 165, 216, 0.2), transparent 26%),
    linear-gradient(180deg, #f7f1e6 0%, #eef4f7 52%, #f9fbfc 100%);
}

.search-page__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  border: 1px solid rgba(28, 36, 52, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 20px 60px rgba(40, 62, 81, 0.08);
}

.hero__eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #7b6b51;
}

.search-page__hero h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1.1;
}

.hero__description {
  max-width: 720px;
  margin: 12px 0 0;
  color: #526070;
}

.search-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  margin-top: 24px;
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 36px rgba(40, 62, 81, 0.08);
}

.search-panel__actions {
  display: flex;
  gap: 12px;
}

.search-meta {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 16px;
  color: #617180;
  font-size: 14px;
}

.result-groups {
  display: grid;
  gap: 20px;
  margin-top: 24px;
}

.result-group {
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 42px rgba(40, 62, 81, 0.08);
}

.result-group__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.result-group__header h2 {
  margin: 0;
  font-size: 22px;
}

.result-group__header p {
  margin: 4px 0 0;
  color: #6c7a88;
}

.result-group__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.resource-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 220px;
  padding: 18px;
  border: 1px solid rgba(28, 36, 52, 0.08);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92));
}

.resource-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #6f7b87;
  font-size: 13px;
}

.meta__type {
  color: #9a5a13;
  font-weight: 600;
}

.resource-card h3 {
  margin: 14px 0 10px;
  font-size: 18px;
  line-height: 1.4;
}

.resource-card__content {
  margin: 0;
  color: #4d5a68;
  line-height: 1.7;
  word-break: break-word;
}

.resource-card__tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.resource-card__source {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;
  font-size: 13px;
  color: #6c7a88;
}

.resource-card__source a {
  color: #1f6fd5;
  text-decoration: none;
}

.resource-card__source a:hover {
  text-decoration: underline;
}

.resource-card__tags span {
  padding: 4px 10px;
  border-radius: 999px;
  background: #edf3f6;
  color: #4c6273;
  font-size: 12px;
}

.resource-card__footer {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.empty-state {
  margin-top: 36px;
  padding: 36px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 36px rgba(40, 62, 81, 0.08);
}

@media (max-width: 768px) {
  .search-page {
    padding: 16px;
  }

  .search-page__hero {
    flex-direction: column;
    padding: 20px;
    border-radius: 22px;
  }

  .search-page__hero h1 {
    font-size: 28px;
  }

  .search-panel {
    grid-template-columns: 1fr;
    border-radius: 20px;
  }

  .search-panel__actions {
    flex-direction: column;
  }

  .result-group {
    padding: 16px;
    border-radius: 20px;
  }

  .result-group__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
