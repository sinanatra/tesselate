import adapter from "@sveltejs/adapter-static";
const dev = process.argv.includes("dev");

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    paths: {
      base: dev ? "" : process.env.BASE_PATH,
    },
    alias: {
      "@components": "src/components",
      "@stores": "src/routes/stores.js",
      "@utils": "src/utils.js",
    },
  },
};

export default config;
