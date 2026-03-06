/**
 * Script para criar o usuário admin inicial no MongoDB
 * Uso: node scripts/seed-admin.js
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/acquax';

const ADMIN = {
  name: 'Administrador',
  email: 'admin@acquax.com',
  password: 'Admin@123456',
};

async function main() {
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB:', DATABASE_URL);

    const db = client.db();

    // Verificar se usuário já existe
    const existing = await db.collection('User').findOne({ email: ADMIN.email });
    if (existing) {
      console.log('⚠️  Usuário admin já existe:', ADMIN.email);
      return;
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(ADMIN.password, 12);
    const now = new Date();
    const userId = uuidv4();

    // Criar usuário admin
    await db.collection('User').insertOne({
      _id: userId,
      name: ADMIN.name,
      email: ADMIN.email,
      password: hashedPassword,
      mustUpdateCredentials: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    console.log('✅ Usuário admin criado com sucesso!');
    console.log('-----------------------------------');
    console.log('📧 Email:   ', ADMIN.email);
    console.log('🔑 Senha:   ', ADMIN.password);
    console.log('-----------------------------------');
    console.log('⚠️  Troque a senha após o primeiro login!');
  } catch (err) {
    console.error('❌ Erro ao criar usuário admin:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
