# --- 阶段 1: 前端编译 ---
FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
# 先只拷贝 package.json 以利用 Docker 层缓存
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 阶段 2: 后端编译 ---
FROM node:20-alpine AS backend-build
WORKDIR /build/backend
# 同样先利用缓存安装依赖
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# --- 阶段 3: 最终运行镜像 ---
FROM node:20-alpine

# 安装 nginx
RUN apk add --no-cache nginx

WORKDIR /app

# 创建必要目录
RUN mkdir -p /app/config /app/backend /usr/share/nginx/html

# 从之前的阶段拷贝构建产物
COPY --from=frontend-build /build/frontend/dist /usr/share/nginx/html
COPY --from=backend-build /build/backend/dist /app/backend/dist
COPY --from=backend-build /build/backend/package*.json /app/backend/
COPY --from=backend-build /build/backend/.env.example /app/backend/.env.example
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# 设置脚本权限并安装后端生产环境依赖
RUN chmod +x /app/docker-entrypoint.sh \
  && npm --prefix /app/backend ci --omit=dev

# 声明挂载点
VOLUME ["/app/config"]

# 暴露端口 (Render 默认通常会识别并映射)
EXPOSE 8008

# 启动入口脚本
ENTRYPOINT ["/app/docker-entrypoint.sh"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
