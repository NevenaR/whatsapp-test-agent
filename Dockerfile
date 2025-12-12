# Use Node.js 18
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy rest of the app
COPY . .

# Expose port
EXPOSE 3000

# Run the app
CMD ["node", "app.js"]
