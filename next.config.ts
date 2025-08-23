/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Increase body size limit to 10MB
    },
  },
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase API body size limit to 10MB
    },
  },
}

module.exports = nextConfig