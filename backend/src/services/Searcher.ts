import "../utils/runtimePolyfills";
import { AxiosInstance, AxiosHeaders } from "axios";
import { createAxiosInstance } from "../utils/axiosInstance";
import * as cheerio from "cheerio";
import { config } from "../config";
import { logger } from "../utils/logger";

interface CloudLinkItem {
  cloudType: string;
  link: string;
}

interface SourceItem {
  messageId?: string;
  title?: string;
  completeTitle?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  description?: string;
  image?: string;
  cloudLinks?: CloudLinkItem[];
  tags?: string[];
  cloudType?: string;
  sourceName?: string;
  articleUrl?: string;
  validationResult?: LinkValidationResult;
}

interface SearchGroup {
  list: SourceItem[];
  channelInfo: {
    id?: string;
    name: string;
    channelLogo: string;
  };
  id: string;
  supportsLoadMore?: boolean;
}

interface ExternalPost {
  id: string;
  title: string;
  url: string;
  abstract: string;
}

interface TelegramChannel {
  id: string;
  name: string;
}

interface TMDBSearchCandidate {
  tmdbId: string;
  type: "movie" | "tv";
  title: string;
  description: string;
  image?: string;
  releaseDate?: string;
}

interface HDHiveOpenResponse<T> {
  success?: boolean;
  code?: string | number;
  message?: string;
  data?: T;
  meta?: {
    total?: number;
  };
}

interface HDHiveResourceItem {
  slug: string;
  title?: string | null;
  share_size?: string | null;
  video_resolution?: string[];
  source?: string[];
  subtitle_language?: string[];
  subtitle_type?: string[];
  remark?: string | null;
  unlock_points?: number | null;
  unlocked_users_count?: number | null;
  validate_status?: string | null;
  validate_message?: string | null;
  last_validated_at?: string | null;
  is_official?: boolean | null;
  is_unlocked?: boolean;
  created_at?: string | null;
}

interface HDHiveUnlockData {
  url?: string;
  access_code?: string | null;
  full_url?: string;
  already_owned?: boolean;
}

export interface LinkValidationResult {
  status: "valid" | "invalid" | "unknown" | "error";
  httpStatus: number;
  checkedUrl: string;
  finalUrl: string;
  message: string;
  checkedAt: string;
}
export class Searcher {
  private static instance: Searcher;
  private api: AxiosInstance | null = null;
  private readonly leijingBaseUrl = "https://www.leijing2.com";
  private readonly tmdbBaseUrl = "https://www.themoviedb.org";
  private readonly hdhiveBaseUrl = "https://hdhive.com";
  private readonly leijingMaxPosts = 8;
  private readonly telegramSearchConcurrency = 12;
  private readonly hdhiveSearchConcurrency = 4;
  private readonly leijingRememberCookieHeader = [
    "33ee0edee363cf05042563418af465a8__typecho_remember_author=cloud189-user",
    "33ee0edee363cf05042563418af465a8__typecho_remember_mail=cloud189-user%40example.com",
  ].join("; ");

  constructor() {
    this.initAxiosInstance();
    Searcher.instance = this;
  }

  private initAxiosInstance() {
    this.api = createAxiosInstance(
      config.telegram.baseUrl,
      AxiosHeaders.from({
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "cache-control": "max-age=0",
        priority: "u=0, i",
        "sec-ch-ua": '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      }),
      config.proxy.enabled,
      config.proxy.enabled ? { host: config.proxy.host, port: config.proxy.port } : undefined
    );
  }

  public static async updateAxiosInstance(): Promise<void> {
    Searcher.instance.initAxiosInstance();
  }

  private extractCloudLinks(text: string): { links: CloudLinkItem[]; cloudType: string } {
    const links = new Map<string, CloudLinkItem>();
    let cloudType = "";
    Object.entries(config.cloudPatterns).forEach(([type, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((link) => {
          links.set(link, {
            cloudType: type,
            link,
          });
        });
        if (!cloudType) {
          cloudType = type;
        }
      }
    });
    return {
      links: Array.from(links.values()),
      cloudType,
    };
  }

  async validateLink(url: string): Promise<LinkValidationResult> {
    const checkedAt = new Date().toISOString();
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      return {
        status: "invalid",
        httpStatus: 0,
        checkedUrl: normalizedUrl,
        finalUrl: "",
        message: "链接为空",
        checkedAt,
      };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch (error) {
      return {
        status: "invalid",
        httpStatus: 0,
        checkedUrl: normalizedUrl,
        finalUrl: "",
        message: "链接格式无效",
        checkedAt,
      };
    }

    try {
      const response = await this.api?.get<string>(normalizedUrl, {
        baseURL: undefined,
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: "text",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
        },
      });

      const httpStatus = Number(response?.status || 0);
      const finalUrl = String(response?.request?.res?.responseUrl || normalizedUrl);
      const body = String(response?.data || "");
      const bodyText = this.normalizeValidationText(body);

      if (httpStatus === 404 || httpStatus === 410) {
        return {
          status: "invalid",
          httpStatus,
          checkedUrl: normalizedUrl,
          finalUrl,
          message: `HTTP ${httpStatus}，链接疑似已失效`,
          checkedAt,
        };
      }

      if (this.hasInvalidShareMarkers(bodyText)) {
        return {
          status: "invalid",
          httpStatus,
          checkedUrl: normalizedUrl,
          finalUrl,
          message: "页面提示资源不存在或分享已失效",
          checkedAt,
        };
      }

      if (httpStatus >= 200 && httpStatus < 400) {
        return {
          status: "valid",
          httpStatus,
          checkedUrl: normalizedUrl,
          finalUrl,
          message: `HTTP ${httpStatus}，链接可访问`,
          checkedAt,
        };
      }

      if (httpStatus === 401 || httpStatus === 403) {
        return {
          status: "unknown",
          httpStatus,
          checkedUrl: normalizedUrl,
          finalUrl,
          message: `HTTP ${httpStatus}，目标站点拒绝探测，请人工确认`,
          checkedAt,
        };
      }

      if (httpStatus > 0) {
        return {
          status: "unknown",
          httpStatus,
          checkedUrl: normalizedUrl,
          finalUrl,
          message: `HTTP ${httpStatus}，暂时无法确定链接是否有效`,
          checkedAt,
        };
      }
    } catch (error) {
      logger.warn(`链接有效性检测失败: ${normalizedUrl}`);
      return {
        status: "error",
        httpStatus: 0,
        checkedUrl: normalizedUrl,
        finalUrl: normalizedUrl,
        message: "请求失败，暂时无法完成检测",
        checkedAt,
      };
    }

    return {
      status: "unknown",
      httpStatus: 0,
      checkedUrl: normalizedUrl,
      finalUrl: normalizedUrl,
      message: "暂时无法确定链接是否有效",
      checkedAt,
    };
  }

  async searchAll(keyword: string, channelId?: string, messageId?: string) {
    const allResults: SearchGroup[] = [];
    const isLeijingOnly = channelId === "leijing2";
    const isHDHiveOnly = channelId === "hdhive";

    const channelList: TelegramChannel[] = isLeijingOnly || isHDHiveOnly
      ? []
      : channelId
      ? config.telegram.channels.filter((channel) => channel.id === channelId)
      : config.telegram.channels;

    if (channelList.length === 0 && !isLeijingOnly && !isHDHiveOnly && channelId) {
      return {
        data: [],
      };
    }

    const telegramGroups = await this.mapWithConcurrency(
      channelList,
      this.telegramSearchConcurrency,
      async (channel) => this.searchTelegramChannel(channel, keyword, messageId)
    );

    allResults.push(
      ...telegramGroups.filter((group): group is SearchGroup => Boolean(group))
    );

    if (!messageId && keyword.trim() && (!channelId || isHDHiveOnly)) {
      try {
        const hdhiveGroup = await this.searchHDHive(keyword.trim());
        if (hdhiveGroup?.list.length) {
          allResults.push(hdhiveGroup);
        }
      } catch (error) {
        logger.error("搜索影巢失败:", error);
      }
    }

    if (!messageId && (!channelId || isLeijingOnly)) {
      try {
        const leijingGroup = await this.searchLeijing(keyword);
        if (leijingGroup.list.length > 0) {
          allResults.push(leijingGroup);
        }
      } catch (error) {
        logger.error("搜索雷鲸小站失败:", error);
      }
    }

    const validatedResults = await this.filterSearchGroups(allResults);
    return {
      data: validatedResults,
    };
  }

  private async filterSearchGroups(groups: SearchGroup[]): Promise<SearchGroup[]> {
    const validationCache = new Map<string, Promise<LinkValidationResult>>();
    const validatedGroups = await Promise.all(
      groups.map(async (group) => {
        const validatedItems = await Promise.all(
          group.list.map(async (item) => this.validateSearchItem(item, validationCache))
        );
        const list = validatedItems.filter((item): item is SourceItem => Boolean(item));

        if (!list.length) {
          return null;
        }

        return {
          ...group,
          list,
        };
      })
    );

    return validatedGroups.filter((group): group is SearchGroup => Boolean(group));
  }

  private async validateSearchItem(
    item: SourceItem,
    validationCache: Map<string, Promise<LinkValidationResult>>
  ): Promise<SourceItem | null> {
    const primaryLink = item.cloudLinks?.[0]?.link || item.articleUrl || "";
    if (!primaryLink) {
      return null;
    }

    const validationTask = this.getValidationTask(primaryLink, validationCache);
    const validationResult = await validationTask;

    if (validationResult.status === "invalid") {
      return null;
    }

    return {
      ...item,
      validationResult,
    };
  }

  private getValidationTask(
    link: string,
    validationCache: Map<string, Promise<LinkValidationResult>>
  ): Promise<LinkValidationResult> {
    const cachedTask = validationCache.get(link);
    if (cachedTask) {
      return cachedTask;
    }

    const validationTask = this.validateLink(link)
      .catch((error) => {
        logger.warn(`链接有效性检测任务失败: ${link}`);
        throw error;
      })
      .finally(() => {
        const currentTask = validationCache.get(link);
        if (currentTask === validationTask) {
          validationCache.delete(link);
        }
      });

    validationCache.set(link, validationTask);
    return validationTask;
  }

  private async searchHDHive(keyword: string): Promise<SearchGroup | null> {
    if (!config.hdhive.enabled) {
      return null;
    }

    if (!config.hdhive.apiKey) {
      logger.info("影巢搜索已跳过：未配置 HDHIVE_API_KEY");
      return null;
    }

    const candidates = await this.fetchTMDBSearchCandidates(keyword);
    if (!candidates.length) {
      return null;
    }

    const resolvedResults = await this.mapWithConcurrency(
      candidates,
      this.hdhiveSearchConcurrency,
      async (candidate) => this.resolveHDHiveCandidate(candidate)
    );

    const dedupedItems = new Map<string, SourceItem>();
    resolvedResults.flat().forEach((item) => {
      const primaryLink = item.cloudLinks?.[0]?.link || "";
      if (!primaryLink || dedupedItems.has(primaryLink)) {
        return;
      }
      dedupedItems.set(primaryLink, item);
    });

    if (!dedupedItems.size) {
      return null;
    }

    return {
      id: "hdhive",
      supportsLoadMore: false,
      channelInfo: {
        id: "hdhive",
        name: "影巢 HDHive",
        channelLogo: `${this.hdhiveBaseUrl}/favicon.ico`,
      },
      list: Array.from(dedupedItems.values()),
    };
  }

  private async fetchTMDBSearchCandidates(keyword: string): Promise<TMDBSearchCandidate[]> {
    const searchUrl = `${this.tmdbBaseUrl}/search?query=${encodeURIComponent(keyword)}`;
    const response = await this.api?.get<string>(searchUrl, {
      baseURL: undefined,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    const html = String(response?.data || "");
    const $ = cheerio.load(html);
    const candidates: TMDBSearchCandidate[] = [];
    const seen = new Set<string>();
    const limit = Math.max(1, config.hdhive.tmdbSearchLimit);

    $(".search_results.tv, .search_results.movie").each((_, section) => {
      const sectionEl = $(section);
      const sectionType = sectionEl.hasClass("movie") ? "movie" : "tv";

      sectionEl.find(".media-card-list > div").each((__, card) => {
        if (candidates.length >= limit) {
          return false;
        }

        const cardEl = $(card);
        const linkEl = cardEl.find("a[data-media-type]").first();
        const href = linkEl.attr("href") || "";
        const match = href.match(/\/(movie|tv)\/(\d+)/);
        if (!match) {
          return undefined;
        }

        const type = (match[1] as "movie" | "tv") || sectionType;
        const tmdbId = match[2];
        const dedupeKey = `${type}:${tmdbId}`;
        if (!tmdbId || seen.has(dedupeKey)) {
          return undefined;
        }

        const title =
          cardEl.find("h2 span").first().text().trim() ||
          linkEl.text().replace(/\s+/g, " ").trim();
        const description = cardEl.find(".mt-4 p").text().replace(/\s+/g, " ").trim();
        const releaseDate = cardEl.find(".release_date").text().replace(/\s+/g, " ").trim();
        const image = cardEl.find("img.poster").attr("src") || "";

        seen.add(dedupeKey);
        candidates.push({
          tmdbId,
          type,
          title,
          description,
          releaseDate,
          image,
        });

        return undefined;
      });

      if (candidates.length >= limit) {
        return false;
      }

      return undefined;
    });

    return candidates;
  }

  private async resolveHDHiveCandidate(candidate: TMDBSearchCandidate): Promise<SourceItem[]> {
    const resources = await this.fetchHDHiveResources(candidate);
    if (!resources.length) {
      return [];
    }

    const safeResources = resources
      .filter((resource) => this.isHDHiveResourceUnlockable(resource))
      .filter((resource) => resource.validate_status !== "invalid")
      .slice(0, Math.max(1, config.hdhive.resourceLimit));

    if (!safeResources.length) {
      return [];
    }

    const results = await Promise.allSettled(
      safeResources.map(async (resource) => this.buildHDHiveSourceItem(candidate, resource))
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<SourceItem | null> => result.status === "fulfilled"
      )
      .map((result) => result.value)
      .filter((item): item is SourceItem => Boolean(item));
  }

  private async fetchHDHiveResources(candidate: TMDBSearchCandidate): Promise<HDHiveResourceItem[]> {
    const requestUrl = `${this.hdhiveBaseUrl}/api/open/resources/${candidate.type}/${candidate.tmdbId}`;
    const response = await this.api?.get<HDHiveOpenResponse<HDHiveResourceItem[]>>(requestUrl, {
      baseURL: undefined,
      validateStatus: () => true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "X-API-Key": config.hdhive.apiKey,
      },
    });

    if (!response || response.status !== 200) {
      const errorCode =
        typeof response?.data === "object" && response?.data ? String(response.data.code || "") : "";
      logger.warn(
        `影巢资源查询失败: ${candidate.type}/${candidate.tmdbId} status=${response?.status || 0} code=${errorCode}`
      );
      return [];
    }

    return Array.isArray(response.data?.data) ? response.data.data : [];
  }

  private isHDHiveResourceUnlockable(resource: HDHiveResourceItem): boolean {
    if (resource.is_unlocked) {
      return true;
    }

    if (resource.unlock_points === null || resource.unlock_points === undefined) {
      return true;
    }

    return Number(resource.unlock_points) === 0;
  }

  private async buildHDHiveSourceItem(
    candidate: TMDBSearchCandidate,
    resource: HDHiveResourceItem
  ): Promise<SourceItem | null> {
    if (!resource.slug) {
      return null;
    }

    const unlockData = await this.unlockHDHiveResource(resource.slug);
    const rawLink = String(unlockData?.full_url || unlockData?.url || "").trim();
    if (!rawLink) {
      return null;
    }

    const cloudInfo = this.toCloudInfo(rawLink);
    const tagSet = new Set<string>([
      "#影巢",
      candidate.type === "movie" ? "#电影" : "#剧集",
      resource.is_unlocked ? "#已解锁" : "#免费",
    ]);

    (resource.video_resolution || []).slice(0, 2).forEach((item) => tagSet.add(`#${item}`));
    (resource.source || []).slice(0, 2).forEach((item) => tagSet.add(`#${item}`));
    if (resource.is_official) {
      tagSet.add("#官方");
    }

    const content = [
      resource.title && resource.title !== candidate.title ? resource.title : "",
      resource.share_size ? `大小：${resource.share_size}` : "",
      resource.remark ? `备注：${resource.remark}` : "",
      candidate.description,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      messageId: `hdhive-${resource.slug}`,
      title: resource.title || candidate.title,
      completeTitle: resource.title || candidate.title,
      pubDate: resource.created_at || candidate.releaseDate || "",
      content,
      image: candidate.image,
      cloudLinks: cloudInfo.links,
      cloudType: cloudInfo.cloudType,
      tags: Array.from(tagSet).slice(0, 6),
      sourceName: "影巢 HDHive",
      articleUrl: `${this.hdhiveBaseUrl}/${candidate.type}/${resource.slug}`,
    };
  }

  private async unlockHDHiveResource(slug: string): Promise<HDHiveUnlockData | null> {
    const response = await this.api?.post<HDHiveOpenResponse<HDHiveUnlockData>>(
      `${this.hdhiveBaseUrl}/api/open/resources/unlock`,
      { slug },
      {
        baseURL: undefined,
        validateStatus: () => true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-API-Key": config.hdhive.apiKey,
        },
      }
    );

    if (!response || response.status !== 200) {
      return null;
    }

    return response.data?.data || null;
  }

  private toCloudInfo(link: string): { links: CloudLinkItem[]; cloudType: string } {
    const extracted = this.extractCloudLinks(link);
    if (extracted.links.length > 0) {
      return extracted;
    }

    return {
      links: [
        {
          cloudType: this.inferCloudType(link),
          link,
        },
      ],
      cloudType: this.inferCloudType(link),
    };
  }

  private inferCloudType(link: string): string {
    try {
      const hostname = new URL(link).hostname.toLowerCase();

      if (hostname.includes("cloud.189.cn")) {
        return "tianyi";
      }
      if (hostname.includes("pan.quark.cn")) {
        return "quark";
      }
      if (hostname.includes("pan.baidu.com") || hostname.includes("yun.baidu.com")) {
        return "baiduPan";
      }
      if (hostname.includes("aliyundrive.com") || hostname.includes("alipan.com")) {
        return "aliyun";
      }
      if (hostname.includes("115.com") || hostname.includes("anxia.com") || hostname.includes("115cdn.com")) {
        return "pan115";
      }
      if (hostname.includes("123")) {
        return "pan123";
      }
      if (hostname.includes("t.me")) {
        return "telegram";
      }

      return hostname.replace(/^www\./, "") || "direct";
    } catch (error) {
      return "direct";
    }
  }

  private async searchTelegramChannel(
    channel: TelegramChannel,
    keyword: string,
    messageId?: string
  ): Promise<SearchGroup | null> {
    try {
      const messageIdparams = messageId ? `before=${messageId}` : "";
      const url = `/${channel.id}${keyword ? `?q=${encodeURIComponent(keyword)}&${messageIdparams}` : `?${messageIdparams}`}`;
      logger.info(`Searching in channel ${channel.name} with URL: ${url}`);
      const results = await this.searchInWeb(url);
      logger.info(`Found ${results.items.length} items in channel ${channel.name}`);

      const channelResults = results.items
        .filter((item: SourceItem) => item.cloudLinks && item.cloudLinks.length > 0)
        .map((item: SourceItem) => ({
          ...item,
          channel: channel.name,
          channelId: channel.id,
        }));

      if (!channelResults.length) {
        return null;
      }

      return {
        list: channelResults,
        channelInfo: {
          ...channel,
          channelLogo: results.channelLogo,
        },
        id: channel.id,
      };
    } catch (error) {
      logger.error(`搜索频道 ${channel.name} 失败:`, error);
      return null;
    }
  }

  private async mapWithConcurrency<T, TResult>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<TResult>
  ): Promise<TResult[]> {
    if (!items.length) {
      return [];
    }

    const results = new Array<TResult>(items.length);
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    let currentIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < items.length) {
        const index = currentIndex;
        currentIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    });

    await Promise.all(workers);
    return results;
  }

  async searchInWeb(url: string) {
    try {
      if (!this.api) {
        throw new Error("Axios instance is not initialized");
      }
      const response = await this.api.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      const items: SourceItem[] = [];
      let channelLogo = "";
      $(".tgme_header_link").each((_, element) => {
        channelLogo = $(element).find("img").attr("src") || "";
      });
      // 遍历每个消息容器
      $(".tgme_widget_message_wrap").each((_, element) => {
        const messageEl = $(element);

        const messageId = messageEl
          .find(".tgme_widget_message")
          .data("post")
          ?.toString()
          .split("/")[1];

        const title =
          messageEl
            .find(".js-message_text")
            .html()
            ?.split("<br>")[0]
            .replace(/<[^>]+>/g, "")
            .replace(/\n/g, "") || "";

        const content =
          messageEl
            .find(".js-message_text")
            .html()
            ?.replace(title, "")
            .split("<a")[0]
            .replace(/<br>/g, "")
            .trim() || "";

        const pubDate = messageEl.find("time").attr("datetime");

        const image = messageEl
          .find(".tgme_widget_message_photo_wrap")
          .attr("style")
          ?.match(/url\('(.+?)'\)/)?.[1];

        const tags: string[] = [];
        const links = messageEl
          .find(".tgme_widget_message_text a")
          .map((_, el) => $(el).attr("href"))
          .get();
        messageEl.find(".tgme_widget_message_text a").each((index, element) => {
          const tagText = $(element).text();
          if (tagText && tagText.startsWith("#")) {
            tags.push(tagText);
          }
        });
        const cloudInfo = this.extractCloudLinks(links.join(" "));
        items.unshift({
          messageId,
          title,
          pubDate,
          content,
          image,
          cloudLinks: cloudInfo.links,
          cloudType: cloudInfo.cloudType,
          tags,
        });
      });
      return { items: items, channelLogo };
    } catch (error) {
      logger.error(`搜索错误: ${url}`, error);
      return {
        items: [],
        channelLogo: "",
      };
    }
  }

  private async searchLeijing(keyword: string): Promise<SearchGroup> {
    const html = await this.fetchLeijingSearchPage(keyword);
    const posts = this.parseLeijingPosts(html).slice(0, this.leijingMaxPosts);
    const list: SourceItem[] = [];

    const detailResults = await Promise.allSettled(
      posts.map(async (post) => this.resolveLeijingPost(post))
    );

    detailResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        list.push(result.value);
      }
    });

    return {
      id: "leijing2",
      supportsLoadMore: false,
      channelInfo: {
        id: "leijing2",
        name: "雷鲸小站",
        channelLogo: "",
      },
      list,
    };
  }

  private async fetchLeijingSearchPage(keyword: string): Promise<string> {
    const url = `${this.leijingBaseUrl}/index.php/search/${encodeURIComponent(keyword)}/`;
    const response = await this.api?.get(url, {
      baseURL: undefined,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    return String(response?.data || "");
  }

  private async fetchLeijingArticlePage(url: string): Promise<string> {
    const response = await this.api?.get(url, {
      baseURL: undefined,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: this.leijingRememberCookieHeader,
      },
    });
    return String(response?.data || "");
  }

  private parseLeijingPosts(html: string): ExternalPost[] {
    const posts: ExternalPost[] = [];
    const pattern =
      /<a href="([^"]+\/archives\/(\d+)\/)" class="title" title="([^"]+)">[\s\S]*?<a class="abstract" href="[^"]+" title="文章摘要">([\s\S]*?)<\/a>/g;

    for (const match of html.matchAll(pattern)) {
      posts.push({
        id: match[2],
        title: this.decodeHtml(match[3]).trim(),
        url: new URL(match[1], this.leijingBaseUrl).toString(),
        abstract: this.stripTags(this.decodeHtml(match[4])).trim(),
      });
    }
    return posts;
  }

  private async resolveLeijingPost(post: {
    id: string;
    title: string;
    url: string;
    abstract: string;
  }): Promise<SourceItem | null> {
    const linkSet = new Map<string, CloudLinkItem>();

    this.extractTianyiShareLinks(post.abstract).forEach((link) => {
      linkSet.set(link, { cloudType: "tianyi", link });
    });

    try {
      const html = await this.fetchLeijingArticlePage(post.url);
      const content = this.extractLeijingArticleContent(html);
      this.extractTianyiShareLinks(content).forEach((link) => {
        linkSet.set(link, { cloudType: "tianyi", link });
      });
    } catch (error) {
      logger.warn(`抓取雷鲸文章失败: ${post.url}`);
    }

    const cloudLinks = Array.from(linkSet.values());
    if (!cloudLinks.length) {
      return null;
    }

    return {
      messageId: `leijing-${post.id}`,
      title: post.title,
      completeTitle: post.title,
      pubDate: "",
      content: "来自雷鲸小站的帖子分享链接",
      cloudLinks,
      cloudType: "tianyi",
      tags: ["#雷鲸小站"],
      sourceName: "雷鲸小站",
      articleUrl: post.url,
    };
  }

  private extractLeijingArticleContent(html: string): string {
    const match = html.match(/<article class="joe_detail__article"[^>]*>([\s\S]*?)<\/article>/);
    return match ? match[1] : html;
  }

  private extractTianyiShareLinks(content: string): string[] {
    const patterns = [
      /https?:\/\/cloud\.189\.cn\/web\/share\?[^\s"'<>（）()]+/g,
      /https?:\/\/cloud\.189\.cn\/t\/[A-Za-z0-9]+/g,
      /https?:\/\/h5\.cloud\.189\.cn\/share\.html#\/t\/[A-Za-z0-9]+/g,
    ];
    const normalizedContent = this.decodeHtml(content);
    const result = new Set<string>();

    patterns.forEach((pattern) => {
      const matches = normalizedContent.match(pattern) || [];
      matches.forEach((match) => {
        const cleaned = match.replace(/[（(].*$/g, "").replace(/[，。；、）》>\]]+$/g, "").trim();
        if (cleaned) {
          result.add(cleaned);
        }
      });
    });

    return Array.from(result);
  }

  private normalizeValidationText(value: string): string {
    return this.decodeHtml(value)
      .toLowerCase()
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private hasInvalidShareMarkers(text: string): boolean {
    if (!text) {
      return false;
    }

    return [
      "文件不存在",
      "资源不存在",
      "分享已取消",
      "分享已失效",
      "链接不存在",
      "来晚了",
      "来晚啦",
      "啊哦",
      "not found",
      "invalid link",
      "share has been canceled",
      "the file you visited does not exist",
    ].some((marker) => text.includes(marker));
  }

  private stripTags(value: string): string {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }
}

export default new Searcher();
