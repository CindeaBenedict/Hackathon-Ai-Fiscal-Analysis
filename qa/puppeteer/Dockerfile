FROM ghcr.io/puppeteer/puppeteer:24.4.0

WORKDIR /app

COPY package.json ./
RUN npm install
COPY smoke-test.js ./

CMD ["npm", "run", "smoke"]
