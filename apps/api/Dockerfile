FROM node:22-slim

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json turbo.json ./

# Copy workspace package.json files
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install all dependencies from root (resolves workspaces)
RUN npm install

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY packages/tsconfig/ ./packages/tsconfig/
COPY apps/api/ ./apps/api/

# Build shared package first, then the API
WORKDIR /app/packages/shared
RUN npx tsc

WORKDIR /app/apps/api
RUN npx tsc

# Run
EXPOSE 3001
CMD ["node", "dist/index.js"]
