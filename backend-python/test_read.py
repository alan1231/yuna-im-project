from pymongo import MongoClient

# 1. 連線到 Docker 的 MongoDB
client = MongoClient("mongodb://localhost:27017/")

# 2. 指定資料庫與集合
db = client["yuna_chat"]
collection = db["messages"]

# 3. 抓取最新的一筆資料
latest_msg = collection.find_one(sort=[("_id", -1)])

if latest_msg:
    print("🐍 Python 成功讀取到資料！")
    print(f"發送者: {latest_msg.get('sender')}")
    print(f"內容: {latest_msg.get('text')}")
else:
    print("找不到資料，請確認 Go 是否有成功寫入。")