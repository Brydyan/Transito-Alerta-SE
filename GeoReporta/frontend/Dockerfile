FROM node:20-alpine AS build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine

COPY --from=build /build/dist /usr/share/nginx/html
RUN chmod -R o+rX /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
