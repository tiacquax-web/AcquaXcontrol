const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '/home/ubuntu/.env' });

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL nao encontrada no /home/ubuntu/.env');
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('EmailJob');

    const failedJobs = await collection.find({ status: 'failed' }).sort({ updatedAt: -1 }).limit(50).toArray();
    console.log(`Total de falhas encontradas: ${failedJobs.length}`);

    const errorCounts = {};
    for (const job of failedJobs) {
      const err = job.errorMessage || 'Sem mensagem de erro';
      errorCounts[err] = (errorCounts[err] || 0) + 1;
    }

    console.log('Resumo de Erros:');
    console.log(errorCounts);

    console.log('Últimas falhas:');
    failedJobs.slice(0, 10).forEach(j => {
      console.log(`- [${j.updatedAt}] ${j.toEmail}: ${j.errorMessage} (Tentativas: ${j.attempts})`);
    });
  } finally {
    await client.close();
  }
}

main().catch(console.error);
