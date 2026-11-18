import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: 'postgresql://shortener:devpassword@localhost/shortener_test',
      REDIS_URL: 'redis://localhost:6379/1',
    },
  },
});
