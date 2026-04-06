// filepath: /d:/code/CloudDiskDown/backend/src/app.ts
import "./utils/runtimePolyfills";
import "./types/express";
import express from "express";
import { setupMiddlewares } from "./middleware";
import routes from "./routes/api";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";
class App {
  private app = express();

  constructor() {
    this.setupExpress();
  }

  private setupExpress(): void {
    setupMiddlewares(this.app);

    this.app.use("/api", routes);
    this.app.use("/", routes);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      const port = config.app.port;
      this.app.listen(port, () => {
        logger.info(`
🚀 服务器启动成功
🌍 监听端口: ${port}
🔧 运行环境: ${config.app.env}
🔐 登录账号: ${config.auth.username}
        `);
      });
    } catch (error) {
      logger.error("服务器启动失败:", error);
      process.exit(1);
    }
  }
}

// 创建并启动应用
const application = new App();
application.start().catch((error) => {
  logger.error("应用程序启动失败:", error);
  process.exit(1);
});

export default application;
