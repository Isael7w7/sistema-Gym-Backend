const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const tables = await prisma.$queryRaw("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tablas en la BD:', JSON.stringify(tables));
  await prisma.$disconnect();
})();
