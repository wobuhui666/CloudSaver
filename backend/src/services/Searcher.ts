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




export class Searcher {
  private static instance: Searcher;
  private api: AxiosInstance | null = null;
  private readonly leijingBaseUrl = "https://www.leijing2.com";
  private readonly leijingMaxPosts = 8;
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

  async searchAll(keyword: string, channelId?: string, messageId?: string) {
    const allResults: SearchGroup[] = [];
    const isLeijingOnly = channelId === "leijing2";

    const channelList: any[] = isLeijingOnly
      ? []
      : channelId
      ? config.telegram.channels.filter((channel: any) => channel.id === channelId)
      : config.telegram.channels;

    if (channelList.length === 0 && !isLeijingOnly && channelId) {
      return {
        data: [],
      };
    }

    const searchPromises = channelList.map(async (channel) => {
      try {
        const messageIdparams = messageId ? `before=${messageId}` : "";
        const url = `/${channel.id}${keyword ? `?q=${encodeURIComponent(keyword)}&${messageIdparams}` : `?${messageIdparams}`}`;
        logger.info(`Searching in channel ${channel.name} with URL: ${url}`);
        return this.searchInWeb(url).then((results) => {
          logger.info(`Found ${results.items.length} items in channel ${channel.name}`);
          if (results.items.length > 0) {
            const channelResults = results.items
              .filter((item: SourceItem) => item.cloudLinks && item.cloudLinks.length > 0)
              .map((item: SourceItem) => ({
                ...item,
                channel: channel.name,
                channelId: channel.id,
              }));

            allResults.push({
              list: channelResults,
              channelInfo: {
                ...channel,
                channelLogo: results.channelLogo,
              },
              id: channel.id,
            });
          }
        });
      } catch (error) {
        logger.error(`搜索频道 ${channel.name} 失败:`, error);
      }
    });

    await Promise.all(searchPromises);

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


    return {
      data: allResults,
    };
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
