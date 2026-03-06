import { PermissionableEntity, PrismaClient } from '@prisma/client';

interface ExtendedModelContext {
  $name: string;
}

interface ModelClient {
  update(args: { where: object; data: object }): Promise<any>;
  updateMany?(args: { where: object; data: object }): Promise<any>;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient().$extends({
    model: {
      $allModels: {
        async delete({ where }: { where: { id: string } }) {
          const modelName = (this as unknown as ExtendedModelContext).$name;
          const extendedClient = client as unknown as Record<string, ModelClient>;
          return extendedClient[modelName].update({
            where: { ...where },
            data: { deletedAt: new Date() },
          });
        },
      },
      apartment: {
        async deleteMany({ where }: { where: { blockId: string } }) {
          return client.apartment.updateMany({
            where: { ...where },
            data: { deletedAt: new Date() },
          });
        },
      },
    },
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (operation === 'findUnique' || operation === 'findMany') {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
      },
    },
  });

  return client;
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export function cleanEntityBody(body:any) {
    // Remove fields that should not be included in the creation process
    if (body.id) delete body.id; // Prevent conflicts by removing the id field
    if (body.createdAt) delete body.createdAt; // Prevent conflicts by removing the createdAt field
    if (body.updatedAt) delete body.updatedAt; // Prevent conflicts by removing the updatedAt field
    if (body.createdByUserId) delete body.createdByUserId; // Prevent conflicts by removing the createdByUserId field
    if (body.updatedByUserId) delete body.updatedByUserId; // Prevent conflicts by removing the updatedByUserId field
    if (body.deletedAt) delete body.deletedAt; // Prevent conflicts by removing the deletedAt field
    
    // Remove relationship objects that conflict with foreign keys
    if (body.company) delete body.company; // Remove company object, keep companyId
    if (body.block) delete body.block; // Remove block object, keep blockId
    if (body.complex) delete body.complex; // Remove complex object, keep complexId
    if (body.apartment) delete body.apartment; // Remove apartment object, keep apartmentId
    if (body.meter) delete body.meter; // Remove meter object, keep meterId
    if (body.user) delete body.user; // Remove user object, keep userId
    if (body.User) delete body.User; // Remove user object, keep userId
    if (body.role) delete body.role; // Remove role object, keep roleId
    if (body.dealership) delete body.dealership; // Remove dealership object, keep dealershipId
    if (body.typeMeter) delete body.typeMeter; // Remove typeMeter object, keep typeMeterId

    return body;
}

export function isValidPermissionableEntity(value: string | null): value is PermissionableEntity {
  return value !== null && Object.values(PermissionableEntity).includes(value as PermissionableEntity);
}

export default globalForPrisma.prisma ?? prismaClientSingleton();
