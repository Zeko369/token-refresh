FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* tsconfig.json ./
RUN bun install

COPY src ./src
COPY .env.example ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
