const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const client = new S3Client({
  region: process.env.GL_S3_REGION,
  credentials: {
    accessKeyId: process.env.GL_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY,
  },
});

async function main() {
  console.log('Bucket:', process.env.GL_S3_BUCKET);
  console.log('Region:', process.env.GL_S3_REGION);

  // Check the exact path mentioned
  console.log('\n=== Listando events/2026/07/03/ ===');
  try {
    const cmd = new ListObjectsV2Command({
      Bucket: process.env.GL_S3_BUCKET,
      Prefix: 'events/2026/07/03/',
    });
    const res = await client.send(cmd);
    if (res.Contents && res.Contents.length > 0) {
      res.Contents.forEach(obj => {
        console.log(`  ${obj.Key} | ${obj.Size} bytes | ${obj.LastModified}`);
      });
    } else {
      console.log('  (vazio - nenhum arquivo encontrado)');
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  console.log('\n=== Listando events/2026/06/ (últimos dias de junho) ===');
  try {
    const cmd = new ListObjectsV2Command({
      Bucket: process.env.GL_S3_BUCKET,
      Prefix: 'events/2026/06/',
    });
    const res = await client.send(cmd);
    if (res.Contents) {
      const sorted = res.Contents.sort((a,b) => b.LastModified - a.LastModified).slice(0, 10);
      sorted.forEach(obj => console.log(`  ${obj.Key} | ${obj.LastModified}`));
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  console.log('\n=== Listando events/ raiz (prefixo curto p/ ver estrutura real) ===');
  try {
    const cmd = new ListObjectsV2Command({
      Bucket: process.env.GL_S3_BUCKET,
      Prefix: 'events/',
      Delimiter: '/',
      MaxKeys: 20,
    });
    const res = await client.send(cmd);
    console.log('CommonPrefixes:', res.CommonPrefixes);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}
main().catch(e => console.error('FATAL:', e.message));
