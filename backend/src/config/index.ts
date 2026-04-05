import dotenv from "dotenv";

// 加载.env文件
dotenv.config();

interface Channel {
  id: string;
  name: string;
}

interface CloudPatterns {
  baiduPan: RegExp;
  tianyi: RegExp;
  aliyun: RegExp;
  pan115: RegExp;
  pan123: RegExp;
  quark: RegExp;
  yidong: RegExp;
}

interface Config {
  jwtSecret: string;
  auth: {
    username: string;
    password: string;
  };
  telegram: {
    baseUrl: string;
    channels: Channel[];
  };
  proxy: {
    enabled: boolean;
    host: string;
    port: number;
  };

  cloudPatterns: CloudPatterns;
  app: {
    port: number;
    env: string;
  };
  database: {
    type: string;
    path: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

const DEFAULT_TELEGRAM_CHANNELS: Channel[] = [
  { id: "tianyirigeng", name: "天翼云盘资源频道" },
  { id: "cloudtianyi", name: "天翼云盘资源发布频道" },
  { id: "tyypzhpd", name: "天翼云盘综合频道" },
  { id: "tianyiDrive", name: "天翼云盘资源交流群" },
  { id: "tianyifc", name: "天翼云盘 刮削资源分享" },
  { id: "tianyiyunpanpindao", name: "天翼云盘" },
  { id: "yunpan189", name: "网盘资源收藏(天翼云盘)" },
];

// 从环境变量读取频道配置
const getTeleChannels = (): Channel[] => {
  try {
    const channelsStr = process.env.TELE_CHANNELS;
    if (channelsStr) {
      const parsedChannels = JSON.parse(channelsStr);
      if (Array.isArray(parsedChannels) && parsedChannels.length > 0) {
        return parsedChannels;
      }
    }
  } catch (error) {
    console.warn("无法解析 TELE_CHANNELS 环境变量，使用默认配置");
  }

  return DEFAULT_TELEGRAM_CHANNELS;
};

export const config: Config = {
  app: {
    port: parseInt(process.env.PORT || "8009"),
    env: process.env.NODE_ENV || "development",
  },
  auth: {
    username: process.env.CLOUDSAVER_USERNAME || "admin",
    password: process.env.CLOUDSAVER_PASSWORD || "admin123456",
  },
  database: {
    type: "sqlite",
    path: "./data/database.sqlite",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: "6h",
  },
  jwtSecret: process.env.JWT_SECRET || "uV7Y$k92#LkF^q1b!",

  telegram: {
    baseUrl: process.env.TELEGRAM_BASE_URL || "https://t.me/s",
    channels: getTeleChannels(),
  },
  proxy: {
    enabled: process.env.PROXY_ENABLED === "true",
    host: process.env.HTTP_PROXY_HOST || "",
    port: parseInt(process.env.HTTP_PROXY_PORT || "0"),
  },
  cloudPatterns: {
    baiduPan: /https?:\/\/(?:pan|yun)\.baidu\.com\/[^\s<>"]+/g,
    tianyi: /https?:\/\/cloud\.189\.cn\/[^\s<>"]+/g,
    aliyun: /https?:\/\/\w+\.(?:alipan|aliyundrive)\.com\/[^\s<>"]+/g,
    // pan115有两个域名 115.com 和 anxia.com 和 115cdn.com
    pan115: /https?:\/\/(?:115|anxia|115cdn)\.com\/s\/[^\s<>"]+/g,
    // 修改为匹配所有以123开头的域名
    // eslint-disable-next-line no-useless-escape
    pan123: /https?:\/\/(?:www\.)?123[^\/\s<>"]+\.com\/s\/[^\s<>"]+/g,
    quark: /https?:\/\/pan\.quark\.cn\/[^\s<>"]+/g,
    yidong: /https?:\/\/caiyun\.139\.com\/[^\s<>"]+/g,
  },
};
