const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const client = new S3Client({
  region: process.env.GL_S3_REGION,
  credentials: {
    accessKeyId: process.env.GL_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY,
  },
});

async function main() {
  console.log('=== events/2026/07/ (julho inteiro) ===');
  const cmd = new ListObjectsV2Command({
    Bucket: process.env.GL_S3_BUCKET,
    Prefix: 'events/2026/07/',
  });
  const res = await client.send(cmd);
  if (res.Contents) {
    res.Contents.sort((a,b) => a.LastModified - b.LastModified).forEach(obj => {
      console.log(`  ${obj.Key} | ${obj.LastModified}`);
    });
  } else {
    console.log('  vazio');
  }
}
main().catch(e => console.error('FATAL:', e.message));
