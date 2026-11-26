/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // `geist` is ESM and imports `next/font/local` as a directory; let Next resolve it.
  transpilePackages: ['geist'],
};
