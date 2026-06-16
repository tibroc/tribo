# Multi-stage build: build the React app, embed it into the Go binary, ship a
# minimal runtime image.

# 1) Frontend build
FROM node:26-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build   # emits to /app/web/dist

# 2) Go build (embeds the frontend via go:embed)
FROM golang:1.26-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Bring in the freshly built frontend so go:embed picks it up.
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /tribo ./cmd/tribo

# 3) Minimal runtime
FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 tribo && \
    mkdir -p /data && chown tribo /data
USER tribo
COPY --from=backend /tribo /usr/local/bin/tribo
ENV DATABASE_PATH=/data/tribo.db LISTEN_ADDR=:8080
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["tribo"]
