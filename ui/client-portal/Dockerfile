# ---- Build Stage ----
FROM node:20-slim AS build

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all source code
COPY . .

# Create React App inlines REACT_APP_* values at build time, so they are build arguments
# (setting them as container environment variables would have no effect on a static build).
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_WS_URL
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL \
    REACT_APP_WS_URL=$REACT_APP_WS_URL

# Build the app (this creates the production-ready static files)
RUN npm run build


# ---- Production Stage ----
FROM node:20-slim AS production

# Install a lightweight static file server (serve)
RUN npm install -g serve

# Set working directory
WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/build ./build

# Expose port (choose one, e.g., 3000)
EXPOSE 3000

# Use serve to host the static files
CMD ["serve", "-s", "build", "-l", "3000"]
