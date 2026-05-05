import { Router } from "express";
import { ApiResponse } from "../core/ApiResponse";
import { Searcher } from "../services/Searcher";
import { UserService } from "../services/UserService";
import { cacheManager } from "../utils/CacheManager";

const router = Router();
const searcher = new Searcher();
const userService = new UserService();

router.get("/health", (_req, res) => {
  res.json(
    ApiResponse.success(
      {
        service: "cloudsaver-search",
        status: "ok",
      },
      "服务正常"
    )
  );
});

router.post("/user/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await userService.login(username, password);
    res.json(ApiResponse.success(result.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    res.status(200).json(ApiResponse.error(message));
  }
});

router.get("/search", async (req, res) => {
  try {
    const { keyword = "", channelId = "", lastMessageId = "", fast = "" } = req.query;
    const result = await searcher.searchAll(
      String(keyword),
      String(channelId),
      String(lastMessageId),
      fast === "true" || fast === "1"
    );
    res.json(ApiResponse.success(result.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜索失败";
    res.status(200).json(ApiResponse.error(message));
  }
});

// 手动清除搜索缓存
router.post("/cache/clear", (_req, res) => {
  cacheManager.clear();
  res.json(ApiResponse.success(null, "缓存已清除"));
});

router.get("/link/validate", async (req, res) => {
  try {
    const { url = "" } = req.query;
    const result = await searcher.validateLink(String(url));
    res.json(ApiResponse.success(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "链接检测失败";
    res.status(200).json(ApiResponse.error(message));
  }
});

export default router;
