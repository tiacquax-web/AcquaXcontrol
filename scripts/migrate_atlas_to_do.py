"""
MIGRAÇÃO: MongoDB Atlas → Digital Ocean
Objetivo: copiar dados do Atlas que não existem no Digital Ocean
Regra: usar _id como chave de deduplicação (nunca sobrescreve)
"""
import pymongo
from datetime import datetime

ATLAS_URI = 'mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol'
DO_URI    = 'mongodb+srv://doadmin:Tm014AtR79y6ZS83@db-mongodb-acquaxc-nyc3-81713-2abc9433.mongo.ondigitalocean.com/AcquaXControl_PRD?authSource=admin&tls=true'

print("=" * 60)
print("MIGRAÇÃO Atlas → Digital Ocean")
print(f"Iniciado em: {datetime.now()}")
print("=" * 60)

atlas_client = pymongo.MongoClient(ATLAS_URI, serverSelectionTimeoutMS=15000)
do_client    = pymongo.MongoClient(DO_URI, serverSelectionTimeoutMS=15000, tlsAllowInvalidCertificates=True)

atlas_db = atlas_client['acquax']
do_db    = do_client['AcquaXControl_PRD']

# Coleções a migrar (do Atlas para DO, sem sobrescrever existentes)
COLLECTIONS = [
    'TypeMeters',
    'Companies',
    'Roles',
    'Complexes',
    'Blocks',
    'Apartments',
    'Meters',
    'Dealerships',
    'User',
    'Permissions',
    'RoleAssignment',
    'IotDevices',
    'MeterDeviceLinks',
    'Readings',
    'ApartmentConsumptionReports',
    'DealershipReadings',
    'DealershipReadingGas',
    'Reservoirs',
    'ReservoirReadings',
    'Sessions',
    'ScheduledTasks',
    'ScheduleOverrides',
    'RecurringSchedules',
]

total_inserted = 0
total_skipped  = 0

for col_name in COLLECTIONS:
    atlas_col = atlas_db[col_name]
    do_col    = do_db[col_name]

    # Busca todos os IDs já existentes no DO
    existing_ids = set(str(doc['_id']) for doc in do_col.find({}, {'_id': 1}))

    # Busca todos os docs do Atlas
    atlas_docs = list(atlas_col.find({}))

    # Filtra apenas os que não existem no DO
    to_insert = [doc for doc in atlas_docs if str(doc['_id']) not in existing_ids]

    if not to_insert:
        print(f"  [{col_name}] Nenhum doc novo (Atlas={len(atlas_docs)}, DO já tinha tudo)")
        continue

    # Insere em lotes de 500
    inserted = 0
    BATCH = 500
    for i in range(0, len(to_insert), BATCH):
        batch = to_insert[i:i+BATCH]
        try:
            result = do_col.insert_many(batch, ordered=False)
            inserted += len(result.inserted_ids)
        except pymongo.errors.BulkWriteError as e:
            inserted += e.details.get('nInserted', 0)
            print(f"    ⚠️  Alguns docs duplicados ignorados em {col_name}")

    print(f"  ✅ [{col_name}] Inseridos: {inserted} novos (de {len(atlas_docs)} no Atlas, {len(existing_ids)} já no DO)")
    total_inserted += inserted
    total_skipped  += (len(atlas_docs) - inserted)

print()
print("=" * 60)
print(f"MIGRAÇÃO CONCLUÍDA em: {datetime.now()}")
print(f"Total inserido:  {total_inserted} documentos")
print(f"Total ignorado:  {total_skipped} (já existiam no DO)")
print("=" * 60)

# Validação final
print("\nVALIDAÇÃO FINAL — contagem pós-migração:")
print(f"{'Coleção':<35} {'Atlas':>10} {'DO após':>10}")
print("-" * 60)
for col_name in COLLECTIONS:
    a = atlas_db[col_name].count_documents({})
    d = do_db[col_name].count_documents({})
    status = "✅" if d >= a else "⚠️ "
    print(f"  {status} {col_name:<33} {a:>10} {d:>10}")

atlas_client.close()
do_client.close()
