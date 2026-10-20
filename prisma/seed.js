const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  const passwordPlain = 'admin123';
  const passwordHash = await bcrypt.hash(passwordPlain, SALT_ROUNDS);

  const adminUser = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {
      password: passwordHash,
      nombre: 'Administrador',
      rol: 'ADMINISTRADOR',
    },
    create: {
      nombre: 'Administrador',
      usuario: 'admin',
      password: passwordHash,
      rol: 'ADMINISTRADOR',
    },
  });

  console.log(`Usuario admin creado/actualizado: id=${adminUser.id}, usuario=${adminUser.usuario}, rol=${adminUser.rol}`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
