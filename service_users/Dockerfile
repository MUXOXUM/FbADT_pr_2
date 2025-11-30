FROM node:18-alpine

# Install build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (bcrypt will be compiled here)
RUN npm install --production

# Remove build dependencies to reduce image size
# Note: Keep python3 as it might be needed by some npm scripts
RUN apk del make g++

# Copy application code
COPY . .

EXPOSE 8000

CMD ["npm", "start"]