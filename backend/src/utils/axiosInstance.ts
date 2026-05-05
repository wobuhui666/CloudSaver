import axios, { AxiosInstance, AxiosRequestHeaders } from "axios";
import http from "http";
import https from "https";
import tunnel from "tunnel";

interface ProxyConfig {
  host: string;
  port: number;
}

// 全局连接池，复用 TCP 连接
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 });

export function createAxiosInstance(
  baseURL: string,
  headers?: AxiosRequestHeaders,
  useProxy: boolean = false,
  proxyConfig?: ProxyConfig
): AxiosInstance {
  let agent;
  if (useProxy && proxyConfig) {
    agent = tunnel.httpsOverHttp({
      proxy: proxyConfig,
      maxSockets: 20,
    });
  }

  return axios.create({
    baseURL,
    timeout: 30000,
    headers,
    httpAgent: useProxy ? undefined : httpAgent,
    httpsAgent: useProxy ? agent : httpsAgent,
    withCredentials: true,
    // 启用 gzip 压缩
    decompress: true,
  });
}
