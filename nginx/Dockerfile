FROM node:lts-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/
COPY nginx/jardesigner_launcher /usr/share/nginx/html/jardesigner_launcher/
COPY --from=build /app/dist /usr/share/nginx/html/jardesigner/build/
EXPOSE 80