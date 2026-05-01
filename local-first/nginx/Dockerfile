# Build from repository path: local-first/
# Example: docker build -f nginx/Dockerfile -t digikot-nginx:1.0.0 .

FROM node:20-alpine AS webbuilder

WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=webbuilder /web/dist /usr/share/nginx/html
COPY nginx/nginx.prod.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
