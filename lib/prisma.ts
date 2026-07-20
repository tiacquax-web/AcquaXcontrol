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
          // Meter has @@unique([register, status]) — when soft-deleting, set status to 'Inativo'
          // so the register can be reused. Without this, a soft-deleted meter with status 'Ativo'
          // blocks re-registration of the same chassi.
          if (modelName === 'meter') {
            return extendedClient[modelName].update({
              where: { ...where },
              data: { deletedAt: new Date(), status: 'Inativo' },
            });
          }
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
        async $allOperations({ model, operation, args, query }: {
          model: string;
          operation: string;
          args: any;
          query: (args: any) => Promise<any>;
        }) {
          /**
           * Soft-delete global filter.
           *
           * Applies to: findFirst, findMany, count, aggregate.
           *
           * NOT applied to findUnique — Prisma requires the where clause of
           * findUnique to contain ONLY the exact fields of a @unique / @id index.
           * Adding an AND-wrap breaks unique-index resolution and causes a runtime
           * error. findUnique callers that need soft-delete awareness must check the
           * returned value themselves (e.g. `if (!user || user.deletedAt) ...`).
           *
           * EXCLUDED models — these have no `deletedAt` field in the schema,
           * so injecting the filter would always return zero results:
           *   • ScheduleOverride
           *   • SupportMessage
           *   • SuggestionVote
           *
           * WHY WRAP INSTEAD OF SPREAD:
           *   `{ ...args.where, deletedAt: null }` adds `deletedAt: null` as a flat
           *   sibling key alongside any existing `AND`/`OR` clauses. In MongoDB,
           *   Prisma treats top-level sibling keys as an implicit AND — so a document
           *   must satisfy BOTH the existing clause AND `deletedAt: null`. Documents
           *   where `deletedAt` was never written (absent key) fail that check →
           *   findMany returns 0 while count (previously unintercepted) returned N.
           *
           * WHY OR + isSet:
           *   Prisma+MongoDB stores optional DateTime fields as an ABSENT key (not
           *   as explicit null) when the field was never set via `create`. The filter
           *   `{ deletedAt: null }` only matches documents where the field EXISTS as
           *   null. We must also accept the "field is not present at all" case.
           */
          const MODELS_WITHOUT_DELETED_AT = new Set([
            'ScheduleOverride',
            'SupportMessage',
            'SuggestionVote',
          ]);

          // findUnique is intentionally excluded — see comment above.
          const READ_OPS = new Set([
            'findFirst', 'findMany', 'count', 'aggregate',
          ]);

          if (READ_OPS.has(operation) && !MODELS_WITHOUT_DELETED_AT.has(model)) {
            const notDeleted = {
              OR: [
                { deletedAt: null },
                { deletedAt: { isSet: false } },
              ],
            };
            // Wrap: preserve the caller's where intact, add notDeleted as AND sibling.
            // An empty / absent where gets notDeleted directly (no unnecessary AND).
            const hasWhere =
              args.where != null && Object.keys(args.where).length > 0;
            args.where = hasWhere
              ? { AND: [args.where, notDeleted] }
              : notDeleted;
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

    // Remove relation ARRAYS accidentally included in the payload.
    //
    // BUG (found 2026-07-07): frontend edit forms often spread the fetched
    // entity back into the update payload (e.g. `{ ...currentUser, ...formData }`),
    // and fetched entities frequently include relation lists like
    // `Roles: RoleAssignment[]` (see GET /api/user/users, which `include`s Roles).
    // Sending that array straight to `prisma.user.update({ data })` makes Prisma
    // throw `PrismaClientValidationError: Unknown argument Roles`, which the
    // generic error handler in updateEntityData surfaces as the unhelpful
    // "Dados inválidos para atualização" — with no indication of which field
    // was the culprit.
    //
    // There is exactly one scalar array column in the whole schema
    // (GlImportLog.skipLog: String[]), and it is never written through this
    // generic body-cleaning path — so it's safe to strip every array field here.
    for (const key of Object.keys(body)) {
        if (Array.isArray(body[key])) delete body[key];
    }

    return body;
}

export function isValidPermissionableEntity(value: string | null): value is PermissionableEntity {
  return value !== null && Object.values(PermissionableEntity).includes(value as PermissionableEntity);
}

export default globalForPrisma.prisma ?? prismaClientSingleton();
