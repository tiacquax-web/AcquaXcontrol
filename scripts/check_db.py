import os
import pymongo

url = os.environ.get("DATABASE_URL")
if not url:
    print("DATABASE_URL not found")
    exit(1)

client = pymongo.MongoClient(url)
db = client.get_default_database()

print("Complexes:")
for c in db.Complexes.find().limit(5):
    print(c.get("_id"), c.get("socialName"), c.get("aliasName"))

print("\nRecent EmailJobs:")
for j in db.EmailJobs.find().sort("createdAt", -1).limit(10):
    print(j.get("status"), j.get("toEmail"), j.get("subject"), j.get("errorMessage"))
client.close()
