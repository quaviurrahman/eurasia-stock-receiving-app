FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock* yarn-lock.txt* ./
RUN if [ ! -f yarn.lock ] && [ -f yarn-lock.txt ]; then cp yarn-lock.txt yarn.lock; fi; \
    if [ -f yarn.lock ]; then yarn install --frozen-lockfile --network-timeout 600000; \
    else yarn install --network-timeout 600000; fi
COPY . .
# Empty = same-origin: the browser calls /api on the same host, nginx proxies it to the backend.
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max-old-space-size=4096
RUN yarn build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
